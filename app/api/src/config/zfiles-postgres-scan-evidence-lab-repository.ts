import { PrismaClient } from '@prisma/client';
import {
  type TrustedIssuedScanChallenge,
  type VerifiedScanCommitRequest,
  type ZfilesChallengeEvidenceRepository,
} from './zfiles-verified-challenge-gateway-lab';

/**
 * ZFILES-R2-03C2B2: UNREGISTERED LAB adapter for an isolated verifier.
 *
 * Do not instantiate from NestJS API routes. The supplied PostgreSQL
 * connection must be the separately authorized verifier identity, whose only
 * permissions are EXECUTE on the two narrowly-scoped functions.
 *
 * PostgreSQL DOES NOT validate Ed25519. The caller MUST verify the full
 * signed envelope with ZfilesVerifiedChallengeGateway first.
 */
export class ZfilesPostgresChallengeEvidenceLabRepository
  implements ZfilesChallengeEvidenceRepository
{
  constructor(private readonly db: PrismaClient) {}

  async loadChallengeById(
    jobId: string,
  ): Promise<TrustedIssuedScanChallenge | null> {
    const rows = await this.db.$queryRaw<TrustedIssuedScanChallenge[]>`
      SELECT * FROM "read_zfiles_scan_challenge"(${jobId}::uuid)
    `;
    return rows[0] ?? null;
  }

  async commitVerifiedAndConsumeOnce(
    request: VerifiedScanCommitRequest,
  ): Promise<boolean> {
    // The SECURITY DEFINER routine atomically persists the entire envelope
    // and consumes a nonce once; all conflicts/expiry return failure.
    // The DB function performs scope checks, not signature verification.
    const envelopeJson = JSON.stringify(request.evidence);
    const rows = await this.db.$queryRaw<{ accepted: boolean }[]>`
      SELECT "commit_zfiles_verified_scan"(
        ${request.jobId}::uuid,
        ${request.companyId}::text,
        ${request.requestNonce}::uuid,
        ${envelopeJson}::jsonb
      ) AS accepted
    `;
    return rows.length === 1 && rows[0].accepted === true;
  }
}
