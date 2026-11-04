import { ServiceUnavailableException } from '@nestjs/common';
import {
  verifyScanEvidence,
  type EvidenceVerificationPolicy,
  type ScanEvidenceClaims,
  type SignedScanEvidence,
} from './zfiles-signed-scan-evidence-lab';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

export type TrustedIssuedScanChallenge = Readonly<{
  jobId: string;
  companyId: string;
  documentId: string;
  attachmentId: string;
  requestNonce: string;
  quarantineKey: string;
  contentSizeBytes: number;
  contentSha256: string;
  status: 'ISSUED' | 'CONSUMED' | 'EXPIRED';
  issuedAt: Date;
  expiresAt: Date;
}>;

export type VerifiedScanCommitRequest = Readonly<{
  jobId: string;
  companyId: string;
  requestNonce: string;
  evidence: SignedScanEvidence;
}>;

/**
 * This interface is NOT a DB implementation. commitVerifiedAndConsumeOnce
 * MUST atomically insert the full signed evidence and consume the issued job,
 * locking and rechecking tenant, nonce, expiry, hash and attachment status.
 * Never implement it as separate SQL statements or a blind Prisma update.
 */
export interface ZfilesChallengeEvidenceRepository {
  loadChallengeById(jobId: string): Promise<TrustedIssuedScanChallenge | null>;
  commitVerifiedAndConsumeOnce(
    request: VerifiedScanCommitRequest,
  ): Promise<boolean>;
}

export type VerifiedUnreleasedEvidence = Readonly<{
  status: 'VERIFIED_UNRELEASED';
  verdict: 'CLEAN_CANDIDATE' | 'MALWARE_DETECTED';
}>;

const unavailable = () =>
  new ServiceUnavailableException('Evidencia de escaneo no autorizada');

function trustedChallenge(
  value: TrustedIssuedScanChallenge | null,
  requestedId: string,
  nowMs: number,
): value is TrustedIssuedScanChallenge {
  if (!value) return false;
  const issuedAt = value.issuedAt?.getTime();
  const expiresAt = value.expiresAt?.getTime();
  const expectedKey = [
    'quarantine',
    value.companyId,
    value.documentId,
    value.attachmentId,
  ].join('/');
  return (
    value.jobId === requestedId &&
    [
      value.jobId,
      value.companyId,
      value.documentId,
      value.attachmentId,
      value.requestNonce,
    ].every((v) => typeof v === 'string' && UUID.test(v)) &&
    value.quarantineKey === expectedKey &&
    value.status === 'ISSUED' &&
    Number.isSafeInteger(issuedAt) &&
    Number.isSafeInteger(expiresAt) &&
    issuedAt <= nowMs &&
    expiresAt > nowMs &&
    expiresAt - issuedAt >= 60_000 &&
    expiresAt - issuedAt <= 300_000 &&
    Number.isSafeInteger(value.contentSizeBytes) &&
    value.contentSizeBytes >= 1 &&
    value.contentSizeBytes <= 10 * 1024 * 1024 &&
    typeof value.contentSha256 === 'string' &&
    SHA256.test(value.contentSha256)
  );
}

/**
 * 03C2B1 laboratory-only gateway. It has no SQL adapter, keys, R2 credentials,
 * NestJS registration, upload/download route or promotion authority.
 * PostgreSQL atomicity and runtime privilege isolation are future gates.
 */
export class ZfilesVerifiedChallengeGateway {
  constructor(
    private readonly repository: ZfilesChallengeEvidenceRepository,
    private readonly policy: EvidenceVerificationPolicy,
    private readonly clock: () => number = Date.now,
  ) {}

  async verifyAndCommit(
    jobId: string,
    evidence: unknown,
  ): Promise<VerifiedUnreleasedEvidence> {
    try {
      if (!UUID.test(jobId)) throw unavailable();
      const nowMs = this.clock();
      if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
        throw unavailable();
      }
      // This lookup MUST be a trusted DB read, not a caller-supplied object.
      const job = await this.repository.loadChallengeById(jobId);
      if (!trustedChallenge(job, jobId, nowMs)) throw unavailable();

      const claims: ScanEvidenceClaims = verifyScanEvidence(
        evidence,
        {
          companyId: job.companyId,
          documentId: job.documentId,
          attachmentId: job.attachmentId,
          // 03C2A's job uses attachment identity; no upload reservation yet.
          reservationId: job.attachmentId,
          requestNonce: job.requestNonce,
          contentSizeBytes: job.contentSizeBytes,
          contentSha256: job.contentSha256,
        },
        this.policy,
        nowMs,
      );
      if (
        claims.verdict !== 'CLEAN_CANDIDATE' &&
        claims.verdict !== 'MALWARE_DETECTED'
      ) {
        throw unavailable();
      }
      if (claims.quarantineKey !== job.quarantineKey) throw unavailable();

      // Neither this call nor its return value is a release authorization.
      // The future SQL implementation must recheck job state in the same
      // transaction as persisting the *complete* envelope.
      const didCommit = await this.repository.commitVerifiedAndConsumeOnce({
        jobId,
        companyId: job.companyId,
        requestNonce: job.requestNonce,
        evidence: evidence as SignedScanEvidence,
      });
      if (didCommit !== true) throw unavailable();
      return { status: 'VERIFIED_UNRELEASED', verdict: claims.verdict };
    } catch {
      throw unavailable();
    }
  }
}
