import { createHash, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SUPPLIER_ATTACHMENT_MAX_BYTES } from '../supplier-documents/supplier-document-attachment-validation';
import type { ClamAvProtocolVerdict } from './zfiles-clamav-instream-lab';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const JURISDICTIONS = new Set(['default', 'eu', 'us', 'fedramp']);

export type QuarantineScannerQaFixture = Readonly<{
  bucket: 'zaping-quarantine-qa';
  endpoint: string;
  key: string;
  sizeBytes: number;
  sha256: string;
}>;

export type ScannerReadinessSnapshot = Readonly<{
  engineVersion: string;
  databaseVersion: number;
  databaseBuiltAt: string;
  policyVersion: string;
  /** This laboratory explicitly does not attest signature provenance. */
  attested: false;
}>;

export interface QaClamAvScanner {
  scan(bytes: Buffer): Promise<ClamAvProtocolVerdict>;
}

export interface QaScannerReadiness {
  /** Checks PING, VERSION and a separately configured freshness policy. */
  check(): Promise<ScannerReadinessSnapshot>;
}

const failed = () => new Error('Quarantine QA scan was not verified');

function positiveSize(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw failed();
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size > SUPPLIER_ATTACHMENT_MAX_BYTES) {
    throw failed();
  }
  return size;
}

/**
 * Laboratory-only fixture: IDs and hash must be sourced from an independently
 * checked synthetic QA manifest, never from R2 object metadata or an HTTP body.
 * This is NOT a trusted job, tenant authorization, or production scanner.
 */
export function requireQuarantineScannerQaFixture(
  env: NodeJS.ProcessEnv,
): QuarantineScannerQaFixture {
  if (
    env.RUN_ZFILES_R2_QUARANTINE_SCAN_QA !== '1' ||
    env.CI === 'true' ||
    env.GITHUB_ACTIONS === 'true' ||
    env.R2_QUARANTINE_BUCKET !== 'zaping-quarantine-qa' ||
    env.R2_PRIVATE_BUCKET !== 'zaping-private-qa'
  ) {
    throw failed();
  }
  const accountId = env.R2_ACCOUNT_ID ?? '';
  const jurisdiction = env.R2_JURISDICTION ?? 'default';
  const company = env.R2_QUARANTINE_SCAN_COMPANY_ID ?? '';
  const document = env.R2_QUARANTINE_SCAN_DOCUMENT_ID ?? '';
  const attachment = env.R2_QUARANTINE_SCAN_ATTACHMENT_ID ?? '';
  const sha256 = env.R2_QUARANTINE_SCAN_SHA256 ?? '';
  if (
    !/^[0-9a-f]{32}$/.test(accountId) ||
    !JURISDICTIONS.has(jurisdiction) ||
    ![company, document, attachment].every((id) => UUID.test(id)) ||
    !SHA256.test(sha256)
  ) {
    throw failed();
  }
  const sizeBytes = positiveSize(env.R2_QUARANTINE_SCAN_SIZE_BYTES ?? '');
  const jurisdictionPrefix =
    jurisdiction === 'default' ? '' : jurisdiction + '.';
  return {
    bucket: 'zaping-quarantine-qa',
    endpoint:
      'https://' + accountId + '.' + jurisdictionPrefix +
      'r2.cloudflarestorage.com',
    key: ['quarantine', company, document, attachment].join('/'),
    sizeBytes,
    sha256,
  };
}

/**
 * Dedicated quarantine Object Read identity. Configuration alone cannot prove
 * Cloudflare token privileges; verify them externally before live QA.
 * Never reuse R2_QUARANTINE_WRITE_* or R2_READ_* credentials.
 */
export function createQuarantineScannerQaClient(
  env: NodeJS.ProcessEnv,
): { client: S3Client; fixture: QuarantineScannerQaFixture } {
  const fixture = requireQuarantineScannerQaFixture(env);
  const accessKeyId = env.R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID ?? '';
  const secretAccessKey = env.R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY ?? '';
  if (!accessKeyId || !secretAccessKey) throw failed();

  return {
    fixture,
    client: new S3Client({
      region: 'auto',
      endpoint: fixture.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 1,
    }),
  };
}

function verifyReadinessConsistency(
  before: ScannerReadinessSnapshot,
  after: ScannerReadinessSnapshot,
): void {
  if (
    before.attested !== false ||
    after.attested !== false ||
    !/^\d+\.\d+\.\d+$/.test(before.engineVersion) ||
    !Number.isSafeInteger(before.databaseVersion) ||
    before.databaseVersion < 1 ||
    !Number.isFinite(Date.parse(before.databaseBuiltAt)) ||
    !/^[a-z0-9._-]{1,64}$/.test(before.policyVersion) ||
    before.engineVersion !== after.engineVersion ||
    before.databaseVersion !== after.databaseVersion ||
    before.databaseBuiltAt !== after.databaseBuiltAt ||
    before.policyVersion !== after.policyVersion
  ) {
    throw failed();
  }
}

/**
 * Exactly one GetObject of a verified synthetic QA object. Check actual bytes
 * before passing them to INSTREAM. The result remains UNATTESTED and cannot be
 * persisted, promoted, signed as trustworthy, or used for ERP downloads.
 *
 * The readiness adapter is injected for isolation; callers must ensure that
 * check() enforces the defined age/version policy, not only PING/VERSION.
 */
export async function scanVerifiedQuarantineQaObject(
  client: Pick<S3Client, 'send'>,
  fixture: QuarantineScannerQaFixture,
  scanner: QaClamAvScanner,
  readiness: QaScannerReadiness,
): Promise<ClamAvProtocolVerdict> {
  let bytes: Buffer | undefined;
  let stream: Readable | undefined;
  try {
    // Revalidate runtime boundary, not just the environment parser.
    const parts = fixture.key.split('/');
    if (
      fixture.bucket !== 'zaping-quarantine-qa' ||
      parts.length !== 4 ||
      parts[0] !== 'quarantine' ||
      !parts.slice(1).every((part) => UUID.test(part)) ||
      !Number.isSafeInteger(fixture.sizeBytes) ||
      fixture.sizeBytes < 1 ||
      fixture.sizeBytes > SUPPLIER_ATTACHMENT_MAX_BYTES ||
      !SHA256.test(fixture.sha256)
    ) {
      throw failed();
    }
    const before = await readiness.check();
    const response = await client.send(
      new GetObjectCommand({ Bucket: fixture.bucket, Key: fixture.key }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    stream = response.Body instanceof Readable ? response.Body : undefined;
    if (!stream || response.ContentLength !== fixture.sizeBytes) {
      throw failed();
    }

    let length = 0;
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of stream) {
        if (!(chunk instanceof Uint8Array)) throw failed();
        length += chunk.byteLength;
        if (length > fixture.sizeBytes) throw failed();
        const copied = Buffer.from(chunk);
        chunks.push(copied);
        hash.update(copied);
      }
      const actual = hash.digest();
      const expected = Buffer.from(fixture.sha256, 'hex');
      if (
        length !== fixture.sizeBytes ||
        !timingSafeEqual(actual, expected)
      ) {
        throw failed();
      }
      bytes = Buffer.concat(chunks, length);
    } finally {
      for (const chunk of chunks) chunk.fill(0);
    }

    const verdict = await scanner.scan(bytes);
    const after = await readiness.check();
    verifyReadinessConsistency(before, after);
    if (verdict !== 'CLAMD_OK_UNATTESTED' && verdict !== 'MALWARE_DETECTED') {
      throw failed();
    }
    return verdict;
  } catch {
    // Never report a clean result on R2/daemon/readiness failures and never
    // leak object keys, account IDs, signatures, paths, or SDK messages.
    throw failed();
  } finally {
    stream?.destroy();
    bytes?.fill(0);
  }
}
