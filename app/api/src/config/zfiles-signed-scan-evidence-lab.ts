import { ServiceUnavailableException } from '@nestjs/common';
import {
  sign as signEd25519,
  verify as verifyEd25519,
  type KeyObject,
} from 'node:crypto';

/**
 * ZFILES-R2-03C1: cryptographic transport evidence, NOT an authority to release files.
 * This module is intentionally not registered in any NestJS controller,
 * Prisma repository, or worker. Only an isolated worker may hold the private key.
 */
export type ScanEvidenceVerdict =
  'CLEAN_CANDIDATE' | 'MALWARE_DETECTED' | 'SCAN_FAILED';

export type ScanEvidenceClaims = Readonly<{
  protocol: 'zaping-scan-evidence-v1';
  companyId: string;
  documentId: string;
  attachmentId: string;
  reservationId: string;
  requestNonce: string;
  quarantineKey: string;
  contentSizeBytes: number;
  contentSha256: string;
  bytesVerified: boolean;
  verdict: ScanEvidenceVerdict;
  engineVersion: string | null;
  databaseVersion: number | null;
  databaseBuiltAt: string | null;
  readinessBeforeAt: string | null;
  readinessAfterAt: string | null;
  startedAt: string;
  completedAt: string;
  policyVersion: string;
  workerIdentity: string;
  workerBuildDigest: string;
  failureCode: string | null;
}>;

export type SignedScanEvidence = Readonly<{
  keyId: string;
  claims: ScanEvidenceClaims;
  signature: string;
}>;

export type ExpectedScanIdentity = Readonly<{
  companyId: string;
  documentId: string;
  attachmentId: string;
  reservationId: string;
  requestNonce: string;
  contentSizeBytes: number;
  contentSha256: string;
}>;

export type TrustedScannerKey = Readonly<{
  publicKey: KeyObject;
  workerIdentity: string;
  workerBuildDigest: string;
}>;

export type EvidenceVerificationPolicy = Readonly<{
  trustedKeys: ReadonlyMap<string, TrustedScannerKey>;
  allowedPolicyVersions: ReadonlySet<string>;
  allowedEngineVersions: ReadonlySet<string>;
  maxEvidenceAgeMs: number;
  maxDatabaseAgeMs: number;
  maxFutureClockSkewMs: number;
}>;

const failed = () =>
  new ServiceUnavailableException('Evidencia antimalware no verificable');

const CLAIM_KEYS = [
  'protocol',
  'companyId',
  'documentId',
  'attachmentId',
  'reservationId',
  'requestNonce',
  'quarantineKey',
  'contentSizeBytes',
  'contentSha256',
  'bytesVerified',
  'verdict',
  'engineVersion',
  'databaseVersion',
  'databaseBuiltAt',
  'readinessBeforeAt',
  'readinessAfterAt',
  'startedAt',
  'completedAt',
  'policyVersion',
  'workerIdentity',
  'workerBuildDigest',
  'failureCode',
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const SEMVER = /^\d+\.\d+\.\d+$/u;
const FAILURE_CODES = new Set([
  'SCANNER_UNAVAILABLE',
  'READINESS_INVALID',
  'INTEGRITY_MISMATCH',
  'ENGINE_ERROR',
  'SCAN_TIMEOUT',
]);

function timestamp(value: unknown): number | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) {
    return null;
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString() === value ? time : null;
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isValidClaims(value: unknown): value is ScanEvidenceClaims {
  if (!exactKeys(value, CLAIM_KEYS)) return false;
  const x = value as ScanEvidenceClaims;
  if (
    x.protocol !== 'zaping-scan-evidence-v1' ||
    ![
      x.companyId,
      x.documentId,
      x.attachmentId,
      x.reservationId,
      x.requestNonce,
    ].every((v) => typeof v === 'string' && UUID.test(v)) ||
    x.attachmentId !== x.reservationId ||
    x.quarantineKey !==
      `quarantine/${x.companyId}/${x.documentId}/${x.reservationId}` ||
    !Number.isSafeInteger(x.contentSizeBytes) ||
    x.contentSizeBytes < 1 ||
    x.contentSizeBytes > 10 * 1024 * 1024 ||
    typeof x.contentSha256 !== 'string' ||
    !SHA256.test(x.contentSha256) ||
    typeof x.bytesVerified !== 'boolean' ||
    typeof x.policyVersion !== 'string' ||
    !NAME.test(x.policyVersion) ||
    typeof x.workerIdentity !== 'string' ||
    !NAME.test(x.workerIdentity) ||
    typeof x.workerBuildDigest !== 'string' ||
    !SHA256.test(x.workerBuildDigest) ||
    !['CLEAN_CANDIDATE', 'MALWARE_DETECTED', 'SCAN_FAILED'].includes(x.verdict)
  ) {
    return false;
  }

  const start = timestamp(x.startedAt);
  const end = timestamp(x.completedAt);
  if (start === null || end === null || end < start || end - start > 120_000) {
    return false;
  }

  if (x.verdict === 'SCAN_FAILED') {
    return (
      typeof x.failureCode === 'string' && FAILURE_CODES.has(x.failureCode)
    );
  }
  const before = timestamp(x.readinessBeforeAt);
  const after = timestamp(x.readinessAfterAt);
  const databaseBuilt = timestamp(x.databaseBuiltAt);
  return (
    x.failureCode === null &&
    x.bytesVerified === true &&
    typeof x.engineVersion === 'string' &&
    SEMVER.test(x.engineVersion) &&
    Number.isSafeInteger(x.databaseVersion) &&
    x.databaseVersion !== null &&
    x.databaseVersion > 0 &&
    before !== null &&
    after !== null &&
    databaseBuilt !== null &&
    before <= start &&
    end <= after &&
    after - before <= 180_000 &&
    databaseBuilt <= before
  );
}

/** Fixed-order canonical envelope with domain separation; no generic JSON key sorting. */
function message(keyId: string, claims: ScanEvidenceClaims): Buffer {
  const fields = CLAIM_KEYS.map((key) => claims[key]);
  return Buffer.from(
    'zaping:supplier-attachment-scan:v1\n' +
      keyId +
      '\n' +
      JSON.stringify(fields),
    'utf8',
  );
}

/**
 * Scanner-worker-only primitive. Does not attest the origin of input fields:
 * callers MUST derive them from verified R2 bytes, real ClamAV and readiness.
 */
export function signScanEvidence(
  claims: ScanEvidenceClaims,
  keyId: string,
  privateKey: KeyObject,
): SignedScanEvidence {
  if (
    typeof keyId !== 'string' ||
    !NAME.test(keyId) ||
    !isValidClaims(claims) ||
    privateKey.type !== 'private' ||
    privateKey.asymmetricKeyType !== 'ed25519'
  ) {
    throw failed();
  }
  const signature = signEd25519(null, message(keyId, claims), privateKey);
  return { keyId, claims, signature: signature.toString('base64url') };
}

/**
 * Validate signature, pinned key/identity, expected DB job scope and freshness.
 * Replay prevention across requests MUST also be enforced atomically by DB.
 * A successful result is AUTHENTICATED TRANSPORT EVIDENCE ONLY, never AVAILABLE.
 */
export function verifyScanEvidence(
  envelope: unknown,
  expected: ExpectedScanIdentity,
  policy: EvidenceVerificationPolicy,
  nowMs = Date.now(),
): ScanEvidenceClaims {
  if (!exactKeys(envelope, ['keyId', 'claims', 'signature'])) throw failed();
  const e = envelope as SignedScanEvidence;
  if (
    typeof e.keyId !== 'string' ||
    !NAME.test(e.keyId) ||
    !isValidClaims(e.claims) ||
    typeof e.signature !== 'string' ||
    !/^[A-Za-z0-9_-]{86}$/u.test(e.signature) ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0 ||
    !Number.isSafeInteger(policy.maxEvidenceAgeMs) ||
    policy.maxEvidenceAgeMs < 1_000 ||
    policy.maxEvidenceAgeMs > 86_400_000 ||
    !Number.isSafeInteger(policy.maxDatabaseAgeMs) ||
    policy.maxDatabaseAgeMs < 60_000 ||
    policy.maxDatabaseAgeMs > 604_800_000 ||
    !Number.isSafeInteger(policy.maxFutureClockSkewMs) ||
    policy.maxFutureClockSkewMs < 0 ||
    policy.maxFutureClockSkewMs > 60_000
  ) {
    throw failed();
  }

  const trusted = policy.trustedKeys.get(e.keyId);
  if (
    !trusted ||
    trusted.publicKey.type !== 'public' ||
    trusted.publicKey.asymmetricKeyType !== 'ed25519' ||
    e.claims.workerIdentity !== trusted.workerIdentity ||
    e.claims.workerBuildDigest !== trusted.workerBuildDigest ||
    !policy.allowedPolicyVersions.has(e.claims.policyVersion)
  ) {
    throw failed();
  }

  const signature = Buffer.from(e.signature, 'base64url');
  if (
    signature.length !== 64 ||
    signature.toString('base64url') !== e.signature ||
    !verifyEd25519(
      null,
      message(e.keyId, e.claims),
      trusted.publicKey,
      signature,
    )
  ) {
    throw failed();
  }

  const c = e.claims;
  if (
    c.companyId !== expected.companyId ||
    c.documentId !== expected.documentId ||
    c.attachmentId !== expected.attachmentId ||
    c.reservationId !== expected.reservationId ||
    c.requestNonce !== expected.requestNonce ||
    c.contentSizeBytes !== expected.contentSizeBytes ||
    c.contentSha256 !== expected.contentSha256
  ) {
    throw failed();
  }

  const end = timestamp(c.completedAt);
  if (
    end === null ||
    nowMs - end > policy.maxEvidenceAgeMs ||
    end - nowMs > policy.maxFutureClockSkewMs
  ) {
    throw failed();
  }

  if (c.verdict !== 'SCAN_FAILED') {
    const built = timestamp(c.databaseBuiltAt);
    const before = timestamp(c.readinessBeforeAt);
    const after = timestamp(c.readinessAfterAt);
    if (
      built === null ||
      before === null ||
      after === null ||
      !policy.allowedEngineVersions.has(c.engineVersion as string) ||
      before - built > policy.maxDatabaseAgeMs ||
      after - built > policy.maxDatabaseAgeMs ||
      after - nowMs > policy.maxFutureClockSkewMs
    ) {
      throw failed();
    }
  }

  return c;
}
