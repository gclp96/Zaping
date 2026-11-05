import { PrismaClient } from '@prisma/client';
import {
  type PrivateBytesVerifiedUnreleased,
  type TrustedPromotionCandidate,
  ZfilesVerifiedPrivateCopyCore,
} from './zfiles-r2-verified-private-copy-core';
import { ZfilesPostgresPromotionCandidateReader } from './zfiles-postgres-promotion-candidate-reader';

type ReleaseRequest = Readonly<{
  jobId: string;
  companyId: string;
  privateKey: string;
  sha256: string;
  sizeBytes: number;
}>;

export interface ZfilesPrivateReleaseLedger {
  commitVerifiedPrivateRelease(request: ReleaseRequest): Promise<boolean>;
}

/**
 * 03D2B: unregistered, strictly worker-only SQL adapter.
 *
 * The SQL function cannot inspect R2 or validate Ed25519. Only the trusted
 * coordinator below may pass values produced by verified read-back, and its
 * dedicated DB identity may have EXECUTE on this function alone.
 * NO HTTP, API, uploader, scanner or general Nest provider may use it.
 */
export class ZfilesPostgresPrivateReleaseLedger implements ZfilesPrivateReleaseLedger {
  constructor(private readonly db: PrismaClient) {}

  async commitVerifiedPrivateRelease(request: ReleaseRequest): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ released: boolean }[]>`SELECT public."commit_zfiles_verified_private_release"(
        ${request.jobId}::uuid, ${request.companyId}::text,
        ${request.privateKey}::text, ${request.sha256}::text,
        ${request.sizeBytes}::integer
      ) AS released`;
    return rows.length === 1 && rows[0].released === true;
  }
}

/**
 * Orchestration is NOT a public API or a deployed worker.
 * A future isolated process must supply distinct R2 identities and
 * separately provisioned PostgreSQL EXECUTE-only identity.
 */
export class ZfilesPrivateReleaseCoordinator {
  constructor(
    private readonly reader: Pick<ZfilesPostgresPromotionCandidateReader, 'load'>,
    private readonly copy: Pick<ZfilesVerifiedPrivateCopyCore, 'stageVerifiedBytes'>,
    private readonly ledger: ZfilesPrivateReleaseLedger,
  ) {}

  async promote(
    jobId: string,
    companyId: string,
  ): Promise<Readonly<{ status: 'AVAILABLE' | 'UNRELEASED' }>> {
    try {
      const candidate: TrustedPromotionCandidate | null =
        await this.reader.load(jobId, companyId);
      if (!candidate) return { status: 'UNRELEASED' };
      if (candidate.jobId !== jobId || candidate.companyId !== companyId) {
        throw new Error('candidate scope mismatch');
      }

      const verified: PrivateBytesVerifiedUnreleased =
        await this.copy.stageVerifiedBytes(candidate);
      // Copy core has already re-verified Ed25519 + source and private R2
      // bytes. Recheck it did not return a different job's private object.
      const expectedKey = [
        'private',
        candidate.companyId,
        candidate.documentId,
        candidate.attachmentId,
      ].join('/');
      if (
        verified.status !== 'PRIVATE_BYTES_VERIFIED_UNRELEASED' ||
        verified.companyId !== candidate.companyId ||
        verified.attachmentId !== candidate.attachmentId ||
        verified.privateKey !== expectedKey ||
        verified.sha256 !== candidate.contentSha256 ||
        verified.sizeBytes !== candidate.contentSizeBytes
      ) {
        throw new Error('promotion result mismatch');
      }

      const released = await this.ledger.commitVerifiedPrivateRelease({
        jobId: candidate.jobId,
        companyId: candidate.companyId,
        privateKey: verified.privateKey,
        sha256: verified.sha256,
        sizeBytes: verified.sizeBytes,
      });
      return { status: released ? 'AVAILABLE' : 'UNRELEASED' };
    } catch {
      // Do not leak names, R2 keys, credentials, SQL or SDK details.
      // A successful PUT with SQL failure leaves an orphan for 03D3.
      throw new Error('ZFILES-R2-03D2B release failed');
    }
  }
}
