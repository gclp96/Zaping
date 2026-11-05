import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { win32 } from 'node:path';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  inspectSupplierAttachment,
  SUPPLIER_ATTACHMENT_MAX_BYTES,
} from '../supplier-documents/supplier-document-attachment-validation';
import {
  ZfilesVerifiedPrivateCopyCore,
  type TrustedPromotionCandidate,
} from './zfiles-r2-verified-private-copy-core';
import {
  signScanEvidence,
  type EvidenceVerificationPolicy,
  type ScanEvidenceClaims,
} from './zfiles-signed-scan-evidence-lab';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const JURISDICTIONS = new Set(['default', 'eu', 'us', 'fedramp']);
type QaMode = 'CREATE_ONCE' | 'RECOVER_EXISTING';

/** A fixed, public-only error category. No SDK text, key, URL or credentials. */
export class ZfilesR2PrivateQaSafeError extends Error {
  constructor(readonly code: string) {
    super(`ZFILES-R2-03D3B real QA NOT VERIFIED [${code}]`);
  }
}

export type ZfilesR2PrivateQaConfig = Readonly<{
  mode: QaMode;
  endpoint: string;
  companyId: string;
  documentId: string;
  attachmentId: string;
  sha256: string;
  sizeBytes: number;
  originalFile: string;
  quarantineAccessKeyId: string;
  quarantineSecret: string;
  privateAccessKeyId: string;
  privateSecret: string;
}>;

const fail = (code = 'CONFIG') => new ZfilesR2PrivateQaSafeError(code);

/**
 * Local, explicit QA only. This parser must reject CI, production buckets,
 * unconfirmed scoped tokens, mismatched identities and arbitrary source files.
 * A credential NEVER confers authority to release a real ERP attachment.
 */
export function requireZfilesR2PrivateQaConfig(
  env: NodeJS.ProcessEnv,
): ZfilesR2PrivateQaConfig {
  const mode = env.R2_PROMOTER_QA_MODE;
  const companyId = env.R2_QUARANTINE_SCAN_COMPANY_ID ?? '';
  const documentId = env.R2_QUARANTINE_SCAN_DOCUMENT_ID ?? '';
  const attachmentId = env.R2_QUARANTINE_SCAN_ATTACHMENT_ID ?? '';
  const sha256 = env.R2_QUARANTINE_SCAN_SHA256 ?? '';
  const size = env.R2_QUARANTINE_SCAN_SIZE_BYTES ?? '';
  const accountId = env.R2_ACCOUNT_ID ?? '';
  const jurisdiction = env.R2_JURISDICTION ?? 'default';
  const originalFile = env.R2_PROMOTER_QA_LOCAL_ORIGINAL_PDF ?? '';
  const quarantineAccessKeyId = env.R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID ?? '';
  const quarantineSecret = env.R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY ?? '';
  const privateAccessKeyId = env.R2_PROMOTER_QA_PRIVATE_ACCESS_KEY_ID ?? '';
  const privateSecret = env.R2_PROMOTER_QA_PRIVATE_SECRET_ACCESS_KEY ?? '';

  if (
    env.RUN_ZFILES_R2_03D3B_REAL_QA !== '1' ||
    env.CI === 'true' ||
    env.GITHUB_ACTIONS === 'true' ||
    env.NODE_ENV === 'production' ||
    env.R2_PROMOTER_QA_SYNTHETIC_ONLY_CONFIRMED !== '1' ||
    env.R2_SCANNER_QA_READ_ONLY_CONFIRMED !== '1' ||
    env.R2_PROMOTER_QA_PRIVATE_SCOPE_CONFIRMED !== '1' ||
    env.R2_QUARANTINE_BUCKET !== 'zaping-quarantine-qa' ||
    env.R2_PRIVATE_BUCKET !== 'zaping-private-qa' ||
    (mode !== 'CREATE_ONCE' && mode !== 'RECOVER_EXISTING') ||
    (mode === 'CREATE_ONCE' &&
      env.R2_PROMOTER_QA_CREATE_ONCE_APPROVED !== '1') ||
    !/^[0-9a-f]{32}$/u.test(accountId) ||
    !JURISDICTIONS.has(jurisdiction) ||
    ![companyId, documentId, attachmentId].every((id) => UUID.test(id)) ||
    !SHA256.test(sha256) ||
    !/^[1-9][0-9]*$/u.test(size) ||
    !Number.isSafeInteger(Number(size)) ||
    Number(size) > SUPPLIER_ATTACHMENT_MAX_BYTES ||
    !win32.isAbsolute(originalFile) ||
    win32.basename(originalFile) !==
      `quarantine_${companyId}_${documentId}_${attachmentId}.pdf` ||
    !quarantineAccessKeyId ||
    !quarantineSecret ||
    !privateAccessKeyId ||
    !privateSecret ||
    quarantineAccessKeyId === privateAccessKeyId ||
    privateAccessKeyId === env.R2_READ_ACCESS_KEY_ID ||
    privateAccessKeyId === env.R2_QUARANTINE_WRITE_ACCESS_KEY_ID ||
    quarantineAccessKeyId === env.R2_QUARANTINE_WRITE_ACCESS_KEY_ID
  ) {
    throw fail();
  }

  return {
    mode,
    endpoint:
      `https://${accountId}.` +
      (jurisdiction === 'default' ? '' : jurisdiction + '.') +
      'r2.cloudflarestorage.com',
    companyId,
    documentId,
    attachmentId,
    sha256,
    sizeBytes: Number(size),
    originalFile,
    quarantineAccessKeyId,
    quarantineSecret,
    privateAccessKeyId,
    privateSecret,
  };
}

/**
 * Local-only fake signed CLEAN receipt to exercise REAL R2 S3 mechanics.
 * NO ClamAV took place here; signature key is ephemeral and cannot authorize
 * a PostgreSQL release. This result must never enter any persistent ledger.
 */
function syntheticCandidate(config: ZfilesR2PrivateQaConfig): {
  candidate: TrustedPromotionCandidate;
  policy: EvidenceVerificationPolicy;
} {
  const now = Date.now();
  const pair = generateKeyPairSync('ed25519');
  const jobId = randomUUID();
  const requestNonce = randomUUID();
  const claims: ScanEvidenceClaims = {
    protocol: 'zaping-scan-evidence-v1',
    companyId: config.companyId,
    documentId: config.documentId,
    attachmentId: config.attachmentId,
    reservationId: config.attachmentId,
    requestNonce,
    quarantineKey: [
      'quarantine',
      config.companyId,
      config.documentId,
      config.attachmentId,
    ].join('/'),
    contentSizeBytes: config.sizeBytes,
    contentSha256: config.sha256,
    bytesVerified: true,
    verdict: 'CLEAN_CANDIDATE',
    engineVersion: '1.5.4',
    databaseVersion: 28001,
    databaseBuiltAt: new Date(now - 60_000).toISOString(),
    readinessBeforeAt: new Date(now - 5_000).toISOString(),
    readinessAfterAt: new Date(now - 1_000).toISOString(),
    startedAt: new Date(now - 4_000).toISOString(),
    completedAt: new Date(now - 2_000).toISOString(),
    policyVersion: 'zfiles-r2-03d3b-synthetic-qa',
    workerIdentity: 'qa-ephemeral',
    workerBuildDigest: 'a'.repeat(64),
    failureCode: null,
  };
  const signedEnvelope = signScanEvidence(
    claims,
    'qa-ephemeral',
    pair.privateKey,
  );
  const policy: EvidenceVerificationPolicy = {
    trustedKeys: new Map([
      [
        'qa-ephemeral',
        {
          publicKey: pair.publicKey,
          workerIdentity: 'qa-ephemeral',
          workerBuildDigest: 'a'.repeat(64),
        },
      ],
    ]),
    allowedPolicyVersions: new Set(['zfiles-r2-03d3b-synthetic-qa']),
    allowedEngineVersions: new Set(['1.5.4']),
    maxEvidenceAgeMs: 120_000,
    maxDatabaseAgeMs: 48 * 60 * 60_000,
    maxFutureClockSkewMs: 5_000,
  };
  return {
    candidate: {
      jobId,
      companyId: config.companyId,
      documentId: config.documentId,
      attachmentId: config.attachmentId,
      requestNonce,
      quarantineKey: claims.quarantineKey,
      contentSizeBytes: config.sizeBytes,
      contentSha256: config.sha256,
      originalName: 'synthetic.pdf',
      contentType: 'application/pdf',
      jobStatus: 'CONSUMED',
      documentStatus: 'ACTIVE',
      attachmentStatus: 'PENDING_SCAN',
      receipt: {
        jobId,
        companyId: config.companyId,
        documentId: config.documentId,
        attachmentId: config.attachmentId,
        requestNonce,
        verdict: 'CLEAN_CANDIDATE',
        signedEnvelope,
      },
    },
    policy,
  };
}

function makeClient(
  endpoint: string,
  accessKeyId: string,
  secretAccessKey: string,
): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function httpCode(error: unknown): unknown {
  if (error && typeof error === 'object' && '$metadata' in error) {
    return (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata
      ?.httpStatusCode;
  }
  return undefined;
}

/**
 * Performs one real QA operation on a verified synthetic source.
 * CREATE_ONCE: private HEAD(404), core conditional PUT+readback, then
 * independent second conditional PUT must reject 412, then no-write recovery.
 * RECOVER_EXISTING: only source/private HEAD+GET through the recovery core.
 * Neither mode calls SQL, ClamAV, HTTP or DELETE; no files are cleaned up.
 */
export async function runZfilesR2PrivateRealQa(
  env: NodeJS.ProcessEnv,
): Promise<void> {
  let bytes: Buffer | undefined;
  let quarantine: S3Client | undefined;
  let privateStore: S3Client | undefined;
  let stage = 'CONFIG';
  try {
    const config = requireZfilesR2PrivateQaConfig(env);
    stage = 'SOURCE';
    const stat = statSync(config.originalFile);
    if (!stat.isFile() || stat.size !== config.sizeBytes) throw fail('SOURCE');
    bytes = readFileSync(config.originalFile);
    if (
      bytes.length !== config.sizeBytes ||
      createHash('sha256').update(bytes).digest('hex') !== config.sha256
    ) {
      throw fail('SOURCE');
    }
    const inspection = inspectSupplierAttachment({
      originalName: 'synthetic.pdf',
      claimedMime: 'application/pdf',
      bytes,
    });
    if (inspection.sha256 !== config.sha256) throw fail('SOURCE');

    stage = 'CLIENTS';
    quarantine = makeClient(
      config.endpoint,
      config.quarantineAccessKeyId,
      config.quarantineSecret,
    );
    privateStore = makeClient(
      config.endpoint,
      config.privateAccessKeyId,
      config.privateSecret,
    );
    const { candidate, policy } = syntheticCandidate(config);
    const core = new ZfilesVerifiedPrivateCopyCore(
      quarantine,
      privateStore,
      policy,
    );
    const privateKey = [
      'private',
      config.companyId,
      config.documentId,
      config.attachmentId,
    ].join('/');

    // Private QA token must NOT be allowed to inspect the known-existing
    // quarantine source. This is only a HEAD with a scoped identity.
    stage = 'PRIVATE_TOKEN_SCOPE';
    try {
      await privateStore.send(
        new HeadObjectCommand({
          Bucket: 'zaping-quarantine-qa',
          Key: candidate.quarantineKey,
        }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      throw fail('PRIVATE_TOKEN_CROSS_BUCKET_ALLOWED');
    } catch (err) {
      if (err instanceof ZfilesR2PrivateQaSafeError) throw err;
      if (httpCode(err) !== 403) throw fail('PRIVATE_TOKEN_SCOPE');
    }

    if (config.mode === 'CREATE_ONCE') {
      stage = 'PRECHECK';
      try {
        await privateStore.send(
          new HeadObjectCommand({
            Bucket: 'zaping-private-qa',
            Key: privateKey,
          }),
          { abortSignal: AbortSignal.timeout(10_000) },
        );
        throw fail('TARGET_ALREADY_EXISTS');
      } catch (err) {
        if (err instanceof ZfilesR2PrivateQaSafeError) throw err;
        if (httpCode(err) !== 404) throw fail('PRECHECK');
      }

      stage = 'STAGE';
      const staged = await core.stageVerifiedBytes(candidate);
      if (
        staged.status !== 'PRIVATE_BYTES_VERIFIED_UNRELEASED' ||
        staged.privateKey !== privateKey ||
        staged.sha256 !== config.sha256 ||
        staged.sizeBytes !== config.sizeBytes
      ) {
        throw fail('STAGE');
      }

      // Never a second successful write: conditional duplicate MUST be 412.
      stage = 'DUPLICATE';
      try {
        await privateStore.send(
          new PutObjectCommand({
            Bucket: 'zaping-private-qa',
            Key: privateKey,
            Body: bytes,
            ContentLength: bytes.length,
            ContentType: 'application/pdf',
            IfNoneMatch: '*',
          }),
          { abortSignal: AbortSignal.timeout(15_000) },
        );
        throw fail('DUPLICATE_ACCEPTED');
      } catch (err) {
        if (err instanceof ZfilesR2PrivateQaSafeError) throw err;
        if (httpCode(err) !== 412) throw fail('DUPLICATE');
      }
    }

    // Simulate a gap before SQL commit, WITHOUT executing SQL. Recovery
    // MUST NOT issue a PUT, and must re-read both origin and destination.
    stage = 'RECOVERY';
    const recovered = await core.reconcileExistingVerifiedBytes(candidate);
    if (
      recovered.status !== 'PRIVATE_BYTES_VERIFIED_UNRELEASED' ||
      recovered.privateKey !== privateKey ||
      recovered.sha256 !== config.sha256 ||
      recovered.sizeBytes !== config.sizeBytes
    ) {
      throw fail('RECOVERY');
    }

    // The quarantine Object Read token must never read the private object
    // just verified as existing. HTTP 404 or timeout is inconclusive.
    stage = 'QUARANTINE_TOKEN_SCOPE';
    try {
      await quarantine.send(
        new HeadObjectCommand({
          Bucket: 'zaping-private-qa',
          Key: privateKey,
        }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      throw fail('QUARANTINE_TOKEN_CROSS_BUCKET_ALLOWED');
    } catch (err) {
      if (err instanceof ZfilesR2PrivateQaSafeError) throw err;
      if (httpCode(err) !== 403) throw fail('QUARANTINE_TOKEN_SCOPE');
    }
    // This is only storage QA. Never persist AVAILABLE or sign real evidence.
  } catch (err) {
    if (err instanceof ZfilesR2PrivateQaSafeError) throw err;
    throw fail(stage);
  } finally {
    bytes?.fill(0);
    quarantine?.destroy();
    privateStore?.destroy();
  }
}
