import { ServiceUnavailableException } from '@nestjs/common';
import type { KeyObject } from 'node:crypto';
import type { ClamAvReadiness } from './zfiles-clamav-readiness-lab';
import type { ClamAvProtocolVerdict } from './zfiles-clamav-instream-lab';
import {
  signScanEvidence,
  type ExpectedScanIdentity,
  type ScanEvidenceClaims,
  type SignedScanEvidence,
} from './zfiles-signed-scan-evidence-lab';

/**
 * Worker-only adapter contracts. The production quarantine implementation
 * checks the complete R2 byte stream for size/SHA-256 before invoking ClamAV.
 * This orchestrator is NOT wired to HTTP, Prisma or a deployment job.
 */
export interface VerifiedQuarantineScanner {
  scan(
    companyId: string,
    quarantineKey: string,
    sizeBytes: number,
    sha256: string,
  ): Promise<ClamAvProtocolVerdict>;
}

export interface WorkerReadinessProbe {
  check(nowMs: number): Promise<ClamAvReadiness>;
}

export type WorkerSignerConfig = Readonly<{
  keyId: string;
  privateKey: KeyObject;
  workerIdentity: string;
  workerBuildDigest: string;
  policyVersion: string;
}>;

const unavailable = () =>
  new ServiceUnavailableException('Escaneo autenticado no confirmado');

/**
 * ZFILES-R2-03C1 lab-only assembly:
 * 1. Check clamd policy before scanning.
 * 2. Ask the verified quarantine reader to scan exactly the expected bytes.
 * 3. Check the same clamd policy/version/database after scanning.
 * 4. Sign derived claims. This is NOT evidence of actual signature provenance,
 *    nor permission to persist, reject, promote or release an attachment.
 */
export class IsolatedScannerEvidenceWorker {
  constructor(
    private readonly readiness: WorkerReadinessProbe,
    private readonly quarantineScanner: VerifiedQuarantineScanner,
    private readonly signer: WorkerSignerConfig,
    private readonly clock: () => number = Date.now,
  ) {}

  async scan(job: ExpectedScanIdentity): Promise<SignedScanEvidence> {
    try {
      // Reject malformed scope BEFORE any readiness or object-reader call.
      // This is only input-shape validation: a future DB job must authorize it.
      this.assertJobShape(job);
      const before = await this.readiness.check(this.clock());
      const startedMs = this.clock();
      const quarantineKey = [
        'quarantine',
        job.companyId,
        job.documentId,
        job.reservationId,
      ].join('/');

      const result = await this.quarantineScanner.scan(
        job.companyId,
        quarantineKey,
        job.contentSizeBytes,
        job.contentSha256,
      );
      const completedMs = this.clock();
      const after = await this.readiness.check(this.clock());
      this.assertCoherent(before, after, startedMs, completedMs);

      if (result !== 'CLAMD_OK_UNATTESTED' && result !== 'MALWARE_DETECTED') {
        throw unavailable();
      }

      const claims: ScanEvidenceClaims = {
        protocol: 'zaping-scan-evidence-v1',
        ...job,
        quarantineKey,
        bytesVerified: true,
        verdict:
          result === 'CLAMD_OK_UNATTESTED'
            ? 'CLEAN_CANDIDATE'
            : 'MALWARE_DETECTED',
        engineVersion: before.engineVersion,
        databaseVersion: before.databaseVersion,
        databaseBuiltAt: before.databaseBuiltAt,
        readinessBeforeAt: before.observedAt,
        readinessAfterAt: after.observedAt,
        startedAt: new Date(startedMs).toISOString(),
        completedAt: new Date(completedMs).toISOString(),
        policyVersion: this.signer.policyVersion,
        workerIdentity: this.signer.workerIdentity,
        workerBuildDigest: this.signer.workerBuildDigest,
        failureCode: null,
      };
      return signScanEvidence(
        claims,
        this.signer.keyId,
        this.signer.privateKey,
      );
    } catch {
      // No signed clean result survives a daemon outage, changed signatures,
      // R2 integrity failure, ambiguous result, time skew or signing failure.
      throw unavailable();
    }
  }

  private assertJobShape(job: ExpectedScanIdentity): void {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
    const sha256 = /^[0-9a-f]{64}$/u;
    if (
      !job ||
      ![
        job.companyId,
        job.documentId,
        job.attachmentId,
        job.reservationId,
        job.requestNonce,
      ].every((value) => typeof value === 'string' && uuid.test(value)) ||
      job.reservationId !== job.attachmentId ||
      !Number.isSafeInteger(job.contentSizeBytes) ||
      job.contentSizeBytes < 1 ||
      job.contentSizeBytes > 10 * 1024 * 1024 ||
      typeof job.contentSha256 !== 'string' ||
      !sha256.test(job.contentSha256)
    ) {
      throw unavailable();
    }
  }

  private assertCoherent(
    before: ClamAvReadiness,
    after: ClamAvReadiness,
    startedMs: number,
    completedMs: number,
  ): void {
    const beforeMs = Date.parse(before.observedAt);
    const afterMs = Date.parse(after.observedAt);
    const builtMs = Date.parse(before.databaseBuiltAt);
    if (
      before.attested !== false ||
      after.attested !== false ||
      before.policyVersion !== this.signer.policyVersion ||
      after.policyVersion !== this.signer.policyVersion ||
      before.engineVersion !== after.engineVersion ||
      before.databaseVersion !== after.databaseVersion ||
      before.databaseBuiltAt !== after.databaseBuiltAt ||
      !Number.isFinite(beforeMs) ||
      !Number.isFinite(afterMs) ||
      !Number.isFinite(builtMs) ||
      !Number.isSafeInteger(startedMs) ||
      !Number.isSafeInteger(completedMs) ||
      beforeMs > startedMs ||
      startedMs > completedMs ||
      completedMs > afterMs ||
      completedMs - startedMs > 120_000 ||
      afterMs - beforeMs > 180_000 ||
      builtMs > beforeMs
    ) {
      throw unavailable();
    }
  }
}
