import { PrismaClient } from '@prisma/client';
import type { TrustedPromotionCandidate } from './zfiles-r2-verified-private-copy-core';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * 03D2A: UNREGISTERED reader only for a future isolated promoter.
 *
 * Only a dedicated promoter DB identity with EXECUTE on the specific
 * SECURITY DEFINER function may use this. It is NOT an application/HTTP API,
 * does not authorize an end user and cannot change any attachment state.
 *
 * The cast below is a *shape only*, not cryptographic verification.
 * stageVerifiedBytes MUST independently validate the Ed25519 signature,
 * clean verdict, provenance, tenant IDs, nonce, hash and R2 bytes.
 */
export class ZfilesPostgresPromotionCandidateReader {
  constructor(private readonly db: PrismaClient) {}

  async load(
    jobId: string,
    companyId: string,
  ): Promise<TrustedPromotionCandidate | null> {
    if (
      typeof jobId !== 'string' ||
      !UUID.test(jobId) ||
      typeof companyId !== 'string' ||
      !UUID.test(companyId)
    ) {
      throw new Error('ZFILES-R2-03D2A candidate identity invalid');
    }
    const rows = await this.db.$queryRaw<{ candidate: unknown }[]>`
      SELECT public."read_zfiles_promotion_candidate"(
        ${jobId}::uuid, ${companyId}::text
      ) AS candidate
    `;
    if (rows.length !== 1) {
      throw new Error('ZFILES-R2-03D2A candidate lookup failed');
    }
    return (rows[0].candidate as TrustedPromotionCandidate | null) ?? null;
  }
}
