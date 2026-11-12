import { createHash, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { ClamAvProtocolVerdict } from './zfiles-clamav-instream-lab';
import type { ClamAvReadiness } from './zfiles-clamav-readiness-lab';
import { SUPPLIER_ATTACHMENT_MAX_BYTES } from '../supplier-documents/supplier-document-attachment-validation';
import {
  createZfilesQuarantineKey,
  type ZfilesAttachmentOwner,
} from '../zfiles/zfiles-attachment-owner';

/**
 * Test-only manifest from an independently reviewed QA fixture. The fields
 * are never accepted from an HTTP request or untrusted R2 object metadata.
 */
export type QuarantineVerifiedReadQaManifest = Readonly<{
  owner: ZfilesAttachmentOwner;
  attachmentId: string;
  sizeBytes: number;
  sha256: string;
  /** Strong ETag captured independently of this GET, including double quotes. */
  etag: string;
}>;

export type QaQuarantineScanner = {
  scan(bytes: Buffer): Promise<ClamAvProtocolVerdict>;
};

export type QaQuarantineReadiness = {
  check(): Promise<ClamAvReadiness>;
};

const fail = () => new Error('Quarantine QA scan was not verified');
const SHA256 = /^[0-9a-f]{64}$/u;
const STRONG_ETAG = /^"[\x21\x23-\x7e]{1,128}"$/u;

function verifiedKey(manifest: QuarantineVerifiedReadQaManifest): string {
  if (
    !manifest ||
    !Number.isSafeInteger(manifest.sizeBytes) ||
    manifest.sizeBytes < 1 ||
    manifest.sizeBytes > SUPPLIER_ATTACHMENT_MAX_BYTES ||
    typeof manifest.sha256 !== 'string' ||
    !SHA256.test(manifest.sha256) ||
    typeof manifest.etag !== 'string' ||
    !STRONG_ETAG.test(manifest.etag)
  ) {
    throw fail();
  }
  return createZfilesQuarantineKey(manifest.owner, manifest.attachmentId);
}

function requireConsistentReadiness(
  before: ClamAvReadiness,
  after: ClamAvReadiness,
): void {
  if (
    !before ||
    !after ||
    before.attested !== false ||
    after.attested !== false ||
    !Number.isSafeInteger(before.databaseVersion) ||
    before.databaseVersion < 1 ||
    before.engineVersion !== after.engineVersion ||
    before.databaseVersion !== after.databaseVersion ||
    before.databaseBuiltAt !== after.databaseBuiltAt ||
    before.policyVersion !== after.policyVersion
  ) {
    throw fail();
  }
}

/**
 * Isolated, fail-closed QA helper: GET ONE exact quarantine object with
 * If-Match; verify byte length, ETag and SHA-256; then call ClamAV between
 * readiness probes. Never persists a verdict or authorizes AVAILABLE.
 *
 * This does NOT solve post-scan object replacement or prove worker identity.
 * There is deliberately no credential creation, Nest provider or HTTP route.
 */
export async function scanVerifiedQuarantineQaObject(
  client: Pick<S3Client, 'send'>,
  manifest: QuarantineVerifiedReadQaManifest,
  scanner: QaQuarantineScanner,
  readiness: QaQuarantineReadiness,
): Promise<ClamAvProtocolVerdict> {
  let body: Readable | undefined;
  let bytes: Buffer | undefined;
  try {
    const key = verifiedKey(manifest);
    const before = await readiness.check();
    if (before.attested !== false) throw fail();

    const result = await client.send(
      new GetObjectCommand({
        Bucket: 'zaping-quarantine-qa',
        Key: key,
        IfMatch: manifest.etag,
      }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    body = result.Body instanceof Readable ? result.Body : undefined;
    if (
      !body ||
      result.ContentLength !== manifest.sizeBytes ||
      result.ETag !== manifest.etag
    ) {
      throw fail();
    }

    const chunks: Buffer[] = [];
    const digest = createHash('sha256');
    let length = 0;
    try {
      for await (const chunk of body) {
        if (!(chunk instanceof Uint8Array)) throw fail();
        length += chunk.byteLength;
        if (length > manifest.sizeBytes) throw fail();
        const part = Buffer.from(chunk);
        chunks.push(part);
        digest.update(part);
      }
      if (
        length !== manifest.sizeBytes ||
        !timingSafeEqual(digest.digest(), Buffer.from(manifest.sha256, 'hex'))
      ) {
        throw fail();
      }
      bytes = Buffer.concat(chunks, length);
    } finally {
      for (const part of chunks) part.fill(0);
    }

    const verdict = await scanner.scan(bytes);
    const after = await readiness.check();
    requireConsistentReadiness(before, after);
    if (verdict !== 'CLAMD_OK_UNATTESTED' && verdict !== 'MALWARE_DETECTED') {
      throw fail();
    }
    return verdict;
  } catch {
    // Never leak keys, signatures, credentials, or SDK messages to callers.
    throw fail();
  } finally {
    body?.destroy();
    bytes?.fill(0);
  }
}
