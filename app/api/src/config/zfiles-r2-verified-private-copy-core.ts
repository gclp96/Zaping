import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  verifyScanEvidence,
  type EvidenceVerificationPolicy,
  type SignedScanEvidence,
} from './zfiles-signed-scan-evidence-lab';
import {
  inspectSupplierAttachment,
  SUPPLIER_ATTACHMENT_MAX_BYTES,
} from '../supplier-documents/supplier-document-attachment-validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const failure = () =>
  new Error('ZFILES-R2-03D1 private-byte verification failed');

/**
 * MUST come from one tenant-scoped, trusted PostgreSQL query in a future
 * isolated promoter. NEVER accept this value from HTTP or the frontend.
 * No DB reader or authority to mark AVAILABLE is implemented in 03D1.
 */
export type TrustedPromotionCandidate = Readonly<{
  jobId: string;
  companyId: string;
  documentId: string;
  attachmentId: string;
  requestNonce: string;
  quarantineKey: string;
  contentSizeBytes: number;
  contentSha256: string;
  originalName: string;
  contentType: 'application/pdf' | 'image/jpeg';
  jobStatus: 'CONSUMED' | 'ISSUED' | 'EXPIRED';
  documentStatus: string;
  attachmentStatus: string;
  receipt: Readonly<{
    jobId: string;
    companyId: string;
    documentId: string;
    attachmentId: string;
    requestNonce: string;
    verdict: string;
    signedEnvelope: SignedScanEvidence;
  }>;
}>;

export type PrivateBytesVerifiedUnreleased = Readonly<{
  status: 'PRIVATE_BYTES_VERIFIED_UNRELEASED';
  companyId: string;
  attachmentId: string;
  privateKey: string;
  sha256: string;
  sizeBytes: number;
}>;

/**
 * A focused, unregistered storage core. Its two clients MUST use distinct
 * identities: quarantine GET/HEAD, and private PUT-if-absent/GET/HEAD.
 * This class does not authenticate callers, obtain trusted DB data, configure
 * credentials, change attachment state or publish any download endpoint.
 */
export class ZfilesVerifiedPrivateCopyCore {
  constructor(
    private readonly quarantineClient: Pick<S3Client, 'send'>,
    private readonly privateClient: Pick<S3Client, 'send'>,
    private readonly policy: EvidenceVerificationPolicy,
    private readonly clock: () => number = Date.now,
  ) {}

  async stageVerifiedBytes(
    candidate: TrustedPromotionCandidate,
  ): Promise<PrivateBytesVerifiedUnreleased> {
    return this.verifyPrivateBytes(candidate, 'create');
  }

  /**
   * 03D3A: explicit recovery of an already-existing private object after an
   * ambiguous PUT or a failed DB transaction. NEVER writes or deletes R2.
   * Caller must be an isolated promoter with fresh DB candidate authority.
   */
  async reconcileExistingVerifiedBytes(
    candidate: TrustedPromotionCandidate,
  ): Promise<PrivateBytesVerifiedUnreleased> {
    return this.verifyPrivateBytes(candidate, 'existing');
  }

  private async verifyPrivateBytes(
    candidate: TrustedPromotionCandidate,
    mode: 'create' | 'existing',
  ): Promise<PrivateBytesVerifiedUnreleased> {
    let origin: Buffer | undefined;
    let destination: Buffer | undefined;
    try {
      if (!trustedCandidate(candidate)) throw failure();

      // Re-verify the complete Ed25519 envelope. Receipt presence alone is
      // NOT authorization to copy; never promote malware/scan failures.
      const claims = verifyScanEvidence(
        candidate.receipt.signedEnvelope,
        {
          companyId: candidate.companyId,
          documentId: candidate.documentId,
          attachmentId: candidate.attachmentId,
          reservationId: candidate.attachmentId,
          requestNonce: candidate.requestNonce,
          contentSizeBytes: candidate.contentSizeBytes,
          contentSha256: candidate.contentSha256,
        },
        this.policy,
        this.clock(),
      );
      if (
        claims.verdict !== 'CLEAN_CANDIDATE' ||
        candidate.receipt.verdict !== 'CLEAN_CANDIDATE' ||
        claims.quarantineKey !== candidate.quarantineKey
      ) {
        throw failure();
      }

      const sourceHead = await this.quarantineClient.send(
        new HeadObjectCommand({
          Bucket: 'zaping-quarantine-qa',
          Key: candidate.quarantineKey,
        }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      if (
        sourceHead.ContentLength !== candidate.contentSizeBytes ||
        typeof sourceHead.ETag !== 'string' ||
        !/^"[^"]{1,128}"$/u.test(sourceHead.ETag)
      ) {
        throw failure();
      }

      origin = await readExactBytes(
        this.quarantineClient,
        'zaping-quarantine-qa',
        candidate.quarantineKey,
        candidate.contentSizeBytes,
        candidate.contentSha256,
        sourceHead.ETag,
      );

      // The exact bytes that passed SHA-256 are the ones being written.
      // Inspect actual magic bytes, not the filename or reported MIME alone.
      const inspection = inspectSupplierAttachment({
        originalName: candidate.originalName,
        claimedMime: candidate.contentType,
        bytes: origin,
      });
      if (
        inspection.sha256 !== candidate.contentSha256 ||
        inspection.sizeBytes !== candidate.contentSizeBytes ||
        inspection.contentType !== candidate.contentType
      ) {
        throw failure();
      }

      const privateKey = [
        'private',
        candidate.companyId,
        candidate.documentId,
        candidate.attachmentId,
      ].join('/');

      // Create-only mode retains 03D1 semantics. An ambiguous PUT failure
      // MUST NOT be treated as success; the isolated caller can explicitly
      // invoke recovery later after obtaining a fresh candidate from SQL.
      // Recovery mode performs NO PUT, COPY, DELETE, LIST or overwrite.
      if (mode === 'create') {
        await this.privateClient.send(
          new PutObjectCommand({
            Bucket: 'zaping-private-qa',
            Key: privateKey,
            Body: origin,
            ContentLength: candidate.contentSizeBytes,
            ContentType: inspection.contentType,
            IfNoneMatch: '*',
          }),
          { abortSignal: AbortSignal.timeout(15_000) },
        );
      }

      // Never trust a PUT response, 412, timeout or HEAD metadata as proof
      // of the destination. Read the COMPLETE private bytes independently.
      destination = await readExactBytes(
        this.privateClient,
        'zaping-private-qa',
        privateKey,
        candidate.contentSizeBytes,
        candidate.contentSha256,
      );

      // A long R2 operation must not turn an expired/revoked scan policy
      // into a release. Re-evaluate signature, key and freshness after GET.
      verifyScanEvidence(
        candidate.receipt.signedEnvelope,
        {
          companyId: candidate.companyId,
          documentId: candidate.documentId,
          attachmentId: candidate.attachmentId,
          reservationId: candidate.attachmentId,
          requestNonce: candidate.requestNonce,
          contentSizeBytes: candidate.contentSizeBytes,
          contentSha256: candidate.contentSha256,
        },
        this.policy,
        this.clock(),
      );

      return {
        status: 'PRIVATE_BYTES_VERIFIED_UNRELEASED',
        companyId: candidate.companyId,
        attachmentId: candidate.attachmentId,
        privateKey,
        sha256: candidate.contentSha256,
        sizeBytes: candidate.contentSizeBytes,
      };
    } catch {
      // Sanitized error: no keys, credentials, SDK stack or byte content.
      // A successful PUT followed by failed read-back may leave an orphan.
      // A later reconciler must explicitly inspect it; never auto-delete.
      throw failure();
    } finally {
      origin?.fill(0);
      destination?.fill(0);
    }
  }
}

function trustedCandidate(x: TrustedPromotionCandidate): boolean {
  if (!x || !x.receipt) return false;
  const ids = [
    x.jobId,
    x.companyId,
    x.documentId,
    x.attachmentId,
    x.requestNonce,
  ];
  const receipt = x.receipt;
  return (
    ids.every((id) => typeof id === 'string' && UUID.test(id)) &&
    x.jobStatus === 'CONSUMED' &&
    x.documentStatus === 'ACTIVE' &&
    x.attachmentStatus === 'PENDING_SCAN' &&
    x.quarantineKey ===
      ['quarantine', x.companyId, x.documentId, x.attachmentId].join('/') &&
    Number.isSafeInteger(x.contentSizeBytes) &&
    x.contentSizeBytes > 0 &&
    x.contentSizeBytes <= SUPPLIER_ATTACHMENT_MAX_BYTES &&
    typeof x.contentSha256 === 'string' &&
    SHA256.test(x.contentSha256) &&
    (x.contentType === 'application/pdf' || x.contentType === 'image/jpeg') &&
    receipt.jobId === x.jobId &&
    receipt.companyId === x.companyId &&
    receipt.documentId === x.documentId &&
    receipt.attachmentId === x.attachmentId &&
    receipt.requestNonce === x.requestNonce &&
    receipt.verdict === 'CLEAN_CANDIDATE'
  );
}

async function readExactBytes(
  client: Pick<S3Client, 'send'>,
  bucket: 'zaping-quarantine-qa' | 'zaping-private-qa',
  key: string,
  expectedSize: number,
  expectedHash: string,
  ifMatch?: string,
): Promise<Buffer> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(ifMatch ? { IfMatch: ifMatch } : {}),
    }),
    { abortSignal: AbortSignal.timeout(15_000) },
  );
  const body = response.Body instanceof Readable ? response.Body : undefined;
  if (!body) throw failure();

  const parts: Buffer[] = [];
  let total = 0;
  try {
    if (response.ContentLength !== expectedSize) throw failure();
    const sha = createHash('sha256');
    for await (const chunk of body) {
      if (!(chunk instanceof Uint8Array)) throw failure();
      total += chunk.byteLength;
      if (total > expectedSize || total > SUPPLIER_ATTACHMENT_MAX_BYTES) {
        throw failure();
      }
      const part = Buffer.from(chunk);
      parts.push(part);
      sha.update(part);
    }
    if (total !== expectedSize || sha.digest('hex') !== expectedHash) {
      throw failure();
    }
    return Buffer.concat(parts, total);
  } finally {
    body.destroy();
    for (const part of parts) part.fill(0);
  }
}
