import { PrismaClient } from '@prisma/client';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import {
  signScanEvidence,
  type EvidenceVerificationPolicy,
  type ScanEvidenceClaims,
} from '../src/config/zfiles-signed-scan-evidence-lab';
import { ZfilesVerifiedChallengeGateway } from '../src/config/zfiles-verified-challenge-gateway-lab';
import { ZfilesPostgresChallengeEvidenceLabRepository } from '../src/config/zfiles-postgres-scan-evidence-lab-repository';
import { ZfilesPostgresPrivateReleaseLedger } from '../src/config/zfiles-postgres-private-release';

const describePg =
  process.env.RUN_ZFILES_PRIVATE_RELEASE_PG === '1' ? describe : describe.skip;

describePg(
  'ZFILES-R2-03D2B transactional release on disposable PostgreSQL 16',
  () => {
    let db: PrismaClient;
    let promoter: PrismaClient;
    let secondPromoter: PrismaClient;
    let unrelated: PrismaClient;
    let ownerRole: string;
    let promoterRole: string;
    let unrelatedRole: string;
    const pair = generateKeyPairSync('ed25519');
    const policy: EvidenceVerificationPolicy = {
      trustedKeys: new Map([
        [
          'qa-signer',
          {
            publicKey: pair.publicKey,
            workerIdentity: 'qa-scanner',
            workerBuildDigest: 'b'.repeat(64),
          },
        ],
      ]),
      allowedEngineVersions: new Set(['1.5.4']),
      allowedPolicyVersions: new Set(['zfiles-b5-real-qa-v1']),
      maxEvidenceAgeMs: 120_000,
      maxDatabaseAgeMs: 48 * 60 * 60_000,
      maxFutureClockSkewMs: 5_000,
    };

    const roleUrl = (raw: string, role: string, pwd: string) => {
      const u = new URL(raw);
      u.username = role;
      u.password = pwd;
      return u.toString();
    };

    beforeAll(async () => {
      const raw = process.env.DATABASE_URL ?? '';
      const u = new URL(raw);
      if (
        process.env.CI !== 'true' ||
        process.env.GITHUB_ACTIONS !== 'true' ||
        !['localhost', '127.0.0.1'].includes(u.hostname) ||
        u.port !== '5432' ||
        u.pathname !== '/zaping_test' ||
        u.username !== 'ci'
      ) {
        throw new Error('03D2B requires disposable GitHub CI PostgreSQL only');
      }

      db = new PrismaClient({ datasources: { db: { url: raw } } });
      const [current] = await db.$queryRaw<
        { database: string; username: string }[]
      >`SELECT current_database() AS database, current_user AS username`;
      expect(current).toEqual({ database: 'zaping_test', username: 'ci' });

      const salt = randomBytes(5).toString('hex');
      ownerRole = 'zbo_' + salt;
      promoterRole = 'zbp_' + salt;
      unrelatedRole = 'zbu_' + salt;
      const pPwd = randomBytes(24).toString('hex');
      const uPwd = randomBytes(24).toString('hex');

      await db.$executeRawUnsafe(
        `CREATE ROLE "${ownerRole}" NOLOGIN NOINHERIT`,
      );
      await db.$executeRawUnsafe(
        `CREATE ROLE "${promoterRole}" LOGIN NOINHERIT PASSWORD '${pPwd}'`,
      );
      await db.$executeRawUnsafe(
        `CREATE ROLE "${unrelatedRole}" LOGIN NOINHERIT PASSWORD '${uPwd}'`,
      );
      await db.$executeRawUnsafe(
        `GRANT USAGE ON SCHEMA public TO "${ownerRole}", "${promoterRole}", "${unrelatedRole}"`,
      );
      await db.$executeRawUnsafe(
        `GRANT SELECT ON "SupplierAttachmentScanJob", "SupplierAttachmentScanReceipt",
        "SupplierDocumentAttachment", "SupplierDocument" TO "${ownerRole}"`,
      );
      await db.$executeRawUnsafe(
        `GRANT SELECT, INSERT ON "SupplierAttachmentPromotionAudit" TO "${ownerRole}"`,
      );
      await db.$executeRawUnsafe(
        `GRANT UPDATE ("status", "scanEngine", "scannedAt")
        ON "SupplierDocumentAttachment" TO "${ownerRole}"`,
      );
      await db.$executeRawUnsafe(
        `GRANT UPDATE ("status") ON "SupplierDocument" TO "${ownerRole}"`,
      );
      await db.$executeRawUnsafe(
        `ALTER FUNCTION public."commit_zfiles_verified_private_release"(uuid,text,text,text,integer)
        OWNER TO "${ownerRole}"`,
      );
      await db.$executeRawUnsafe(
        `GRANT EXECUTE ON FUNCTION public."commit_zfiles_verified_private_release"(uuid,text,text,text,integer)
        TO "${promoterRole}"`,
      );

      promoter = new PrismaClient({
        datasources: { db: { url: roleUrl(raw, promoterRole, pPwd) } },
      });
      secondPromoter = new PrismaClient({
        datasources: { db: { url: roleUrl(raw, promoterRole, pPwd) } },
      });
      unrelated = new PrismaClient({
        datasources: { db: { url: roleUrl(raw, unrelatedRole, uPwd) } },
      });
    });

    afterAll(async () => {
      await Promise.all([
        promoter?.$disconnect(),
        secondPromoter?.$disconnect(),
        unrelated?.$disconnect(),
      ]);
      if (!db) return;
      if (ownerRole) {
        await db.$executeRawUnsafe(
          'ALTER FUNCTION public."commit_zfiles_verified_private_release"(uuid,text,text,text,integer) OWNER TO ci',
        );
      }
      if (promoterRole) {
        await db.$executeRawUnsafe(
          `REVOKE EXECUTE ON FUNCTION public."commit_zfiles_verified_private_release"(uuid,text,text,text,integer) FROM "${promoterRole}"`,
        );
      }
      if (ownerRole) {
        await db.$executeRawUnsafe(
          `REVOKE SELECT, INSERT ON "SupplierAttachmentPromotionAudit" FROM "${ownerRole}"`,
        );
        await db.$executeRawUnsafe(
          `REVOKE SELECT ON "SupplierAttachmentScanJob", "SupplierAttachmentScanReceipt", "SupplierDocumentAttachment", "SupplierDocument" FROM "${ownerRole}"`,
        );
        await db.$executeRawUnsafe(
          `REVOKE UPDATE ("status", "scanEngine", "scannedAt") ON "SupplierDocumentAttachment" FROM "${ownerRole}"`,
        );
      }
      if (ownerRole) {
        await db.$executeRawUnsafe(
          `REVOKE UPDATE ("status") ON "SupplierDocument" FROM "${ownerRole}"`,
        );
      }
      for (const role of [promoterRole, unrelatedRole, ownerRole]) {
        if (!role) continue;
        await db.$executeRawUnsafe(
          `REVOKE USAGE ON SCHEMA public FROM "${role}"`,
        );
        await db.$executeRawUnsafe(`DROP ROLE "${role}"`);
      }
      await db.$disconnect();
    });

    async function fixture() {
      const companyId = randomUUID();
      const documentId = randomUUID();
      const attachmentId = randomUUID();
      const userId = randomUUID();
      await db.company.create({
        data: {
          id: companyId,
          name: '03D2B Synthetic Company',
          rfc: 'ZQB' + companyId.replaceAll('-', '').slice(0, 10),
        },
      });
      await db.user.create({
        data: {
          id: userId,
          companyId,
          firstName: 'Promoter',
          lastName: 'Transactional',
          email: userId + '@example.invalid',
          passwordHash: 'NOT_A_LOGIN',
          role: 'ADMIN',
        },
      });
      const supplier = await db.supplier.create({
        data: { companyId, name: '03D2B synthetic supplier' },
      });
      await db.supplierDocument.create({
        data: {
          id: documentId,
          companyId,
          supplierId: supplier.id,
          type: 'REMISION',
          number: randomUUID(),
          normalizedNumber: randomUUID(),
          documentDate: new Date('2026-11-04T00:00:00.000Z'),
          createdById: userId,
        },
      });
      await db.supplierDocumentAttachment.create({
        data: {
          id: attachmentId,
          companyId,
          documentId,
          uploadedById: userId,
          storageKey: ['private', companyId, documentId, attachmentId].join(
            '/',
          ),
          originalName: 'synthetic.pdf',
          contentType: 'application/pdf',
          sizeBytes: 64,
          sha256: 'a'.repeat(64),
        },
      });
      const [issued] = await db.$queryRaw<
        { jobId: string; requestNonce: string }[]
      >`SELECT * FROM "issue_zfiles_scan_challenge"(
      ${companyId}::text, ${attachmentId}::text, 120::integer
    )`;
      return {
        companyId,
        documentId,
        attachmentId,
        ...issued,
        privateKey: ['private', companyId, documentId, attachmentId].join('/'),
        sha256: 'a'.repeat(64),
        sizeBytes: 64,
      };
    }

    function evidence(
      f: Awaited<ReturnType<typeof fixture>>,
      verdict: 'CLEAN_CANDIDATE' | 'MALWARE_DETECTED' = 'CLEAN_CANDIDATE',
    ) {
      const now = Date.now();
      const claims: ScanEvidenceClaims = {
        protocol: 'zaping-scan-evidence-v1',
        companyId: f.companyId,
        documentId: f.documentId,
        attachmentId: f.attachmentId,
        reservationId: f.attachmentId,
        requestNonce: f.requestNonce,
        quarantineKey: [
          'quarantine',
          f.companyId,
          f.documentId,
          f.attachmentId,
        ].join('/'),
        contentSizeBytes: 64,
        contentSha256: f.sha256,
        bytesVerified: true,
        verdict,
        engineVersion: '1.5.4',
        databaseVersion: 28001,
        databaseBuiltAt: new Date(now - 3_600_000).toISOString(),
        readinessBeforeAt: new Date(now - 2_000).toISOString(),
        readinessAfterAt: new Date(now - 500).toISOString(),
        startedAt: new Date(now - 1_500).toISOString(),
        completedAt: new Date(now - 1_000).toISOString(),
        policyVersion: 'zfiles-b5-real-qa-v1',
        workerIdentity: 'qa-scanner',
        workerBuildDigest: 'b'.repeat(64),
        failureCode: null,
      };
      return signScanEvidence(claims, 'qa-signer', pair.privateKey);
    }

    async function consume(
      f: Awaited<ReturnType<typeof fixture>>,
      verdict: 'CLEAN_CANDIDATE' | 'MALWARE_DETECTED' = 'CLEAN_CANDIDATE',
    ) {
      const gateway = new ZfilesVerifiedChallengeGateway(
        new ZfilesPostgresChallengeEvidenceLabRepository(db),
        policy,
      );
      await expect(
        gateway.verifyAndCommit(f.jobId, evidence(f, verdict)),
      ).resolves.toMatchObject({ status: 'VERIFIED_UNRELEASED', verdict });
    }

    function releaseArgs(f: Awaited<ReturnType<typeof fixture>>) {
      return {
        jobId: f.jobId,
        companyId: f.companyId,
        privateKey: f.privateKey,
        sha256: f.sha256,
        sizeBytes: f.sizeBytes,
      };
    }

    const countAudit = async (attachmentId: string) => {
      const [row] = await db.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::integer AS count FROM "SupplierAttachmentPromotionAudit"
        WHERE "attachmentId" = ${attachmentId}::text`;
      return row.count;
    };

    it('dedicated EXECUTE role cannot read or mutate tables; unrelated role cannot execute', async () => {
      const [rights] = await db.$queryRaw<
        {
          exec: boolean;
          selectAudit: boolean;
          updateAttachment: boolean;
          otherExec: boolean;
        }[]
      >`SELECT
      has_function_privilege(${promoterRole},
        'public.commit_zfiles_verified_private_release(uuid,text,text,text,integer)', 'EXECUTE') AS exec,
      has_table_privilege(${promoterRole},
        '"SupplierAttachmentPromotionAudit"', 'SELECT') AS "selectAudit",
      has_table_privilege(${promoterRole},
        '"SupplierDocumentAttachment"', 'UPDATE') AS "updateAttachment",
      has_function_privilege(${unrelatedRole},
        'public.commit_zfiles_verified_private_release(uuid,text,text,text,integer)', 'EXECUTE') AS "otherExec"`;
      expect(rights).toEqual({
        exec: true,
        selectAudit: false,
        updateAttachment: false,
        otherExec: false,
      });
      await expect(
        promoter.$queryRaw`SELECT * FROM "SupplierAttachmentPromotionAudit"`,
      ).rejects.toThrow();
      await expect(
        promoter.$executeRaw`UPDATE "SupplierDocumentAttachment"
        SET "status" = 'AVAILABLE'`,
      ).rejects.toThrow();
      await expect(
        unrelated.$queryRaw`SELECT public."commit_zfiles_verified_private_release"(
        ${randomUUID()}::uuid, ${randomUUID()}::text, 'key', 'hash', 1
      )`,
      ).rejects.toThrow();
    });

    it('releases CLEAN once and makes exact replay idempotent with one immutable audit', async () => {
      const f = await fixture();
      await consume(f);
      const ledger = new ZfilesPostgresPrivateReleaseLedger(promoter);
      await expect(
        ledger.commitVerifiedPrivateRelease(releaseArgs(f)),
      ).resolves.toBe(true);
      await expect(
        ledger.commitVerifiedPrivateRelease(releaseArgs(f)),
      ).resolves.toBe(true);
      expect(await countAudit(f.attachmentId)).toBe(1);
      const attachment = await db.supplierDocumentAttachment.findUniqueOrThrow({
        where: { id: f.attachmentId },
      });
      expect(attachment.status).toBe('AVAILABLE');
      expect(attachment.scanEngine).toBe('ZAPING_R2_CLAMAV_VERIFIED_V1');
      await expect(
        db.supplierDocumentAttachment.update({
          where: { id: f.attachmentId },
          data: { status: 'REJECTED', rejectionReason: 'forgery' },
        }),
      ).rejects.toThrow();
      await expect(
        db.$executeRaw`DELETE FROM "SupplierAttachmentPromotionAudit"
        WHERE "attachmentId" = ${f.attachmentId}`,
      ).rejects.toThrow();
    });

    it('rejects wrong tenant, key, SHA, length and unconsumed jobs without audit', async () => {
      const f = await fixture();
      const ledger = new ZfilesPostgresPrivateReleaseLedger(promoter);
      await expect(
        ledger.commitVerifiedPrivateRelease(releaseArgs(f)),
      ).resolves.toBe(false);
      await consume(f);
      for (const altered of [
        { ...releaseArgs(f), companyId: randomUUID() },
        { ...releaseArgs(f), privateKey: 'private/incorrect' },
        { ...releaseArgs(f), sha256: 'b'.repeat(64) },
        { ...releaseArgs(f), sizeBytes: 65 },
        { ...releaseArgs(f), jobId: randomUUID() },
      ]) {
        await expect(
          ledger.commitVerifiedPrivateRelease(altered),
        ).resolves.toBe(false);
      }
      expect(await countAudit(f.attachmentId)).toBe(0);
      const attachment = await db.supplierDocumentAttachment.findUniqueOrThrow({
        where: { id: f.attachmentId },
      });
      expect(attachment.status).toBe('PENDING_SCAN');
      await expect(
        db.supplierDocumentAttachment.update({
          where: { id: f.attachmentId },
          data: {
            status: 'AVAILABLE',
            scannedAt: new Date(),
            scanEngine: 'spoof',
          },
        }),
      ).rejects.toThrow();
    });

    it('never releases signed MALWARE_DETECTED receipts', async () => {
      const f = await fixture();
      await consume(f, 'MALWARE_DETECTED');
      const ledger = new ZfilesPostgresPrivateReleaseLedger(promoter);
      await expect(
        ledger.commitVerifiedPrivateRelease(releaseArgs(f)),
      ).resolves.toBe(false);
      expect(await countAudit(f.attachmentId)).toBe(0);
    });

    it('serializes two physical connections without duplicate audit events', async () => {
      const f = await fixture();
      await consume(f);
      const a = new ZfilesPostgresPrivateReleaseLedger(promoter);
      const b = new ZfilesPostgresPrivateReleaseLedger(secondPromoter);
      const results = await Promise.all([
        a.commitVerifiedPrivateRelease(releaseArgs(f)),
        b.commitVerifiedPrivateRelease(releaseArgs(f)),
      ]);
      expect(results).toEqual([true, true]);
      expect(await countAudit(f.attachmentId)).toBe(1);
    });
  },
);
