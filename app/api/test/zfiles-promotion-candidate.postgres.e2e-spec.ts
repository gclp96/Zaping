import { PrismaClient } from '@prisma/client';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import {
  signScanEvidence,
  type EvidenceVerificationPolicy,
  type ScanEvidenceClaims,
} from '../src/config/zfiles-signed-scan-evidence-lab';
import { ZfilesVerifiedChallengeGateway } from '../src/config/zfiles-verified-challenge-gateway-lab';
import { ZfilesPostgresChallengeEvidenceLabRepository } from '../src/config/zfiles-postgres-scan-evidence-lab-repository';
import { ZfilesPostgresPromotionCandidateReader } from '../src/config/zfiles-postgres-promotion-candidate-reader';

const describePg =
  process.env.RUN_ZFILES_PROMOTION_CANDIDATE_PG === '1'
    ? describe
    : describe.skip;

describePg('ZFILES-R2-03D2A read-only promotion candidate on physical PostgreSQL', () => {
  let db: PrismaClient;
  let promoter: PrismaClient;
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
      throw new Error('03D2A requires disposable CI PostgreSQL only');
    }
    db = new PrismaClient({ datasources: { db: { url: raw } } });
    const [target] = await db.$queryRaw<
      { database: string; username: string }[]
    >`SELECT current_database() AS database, current_user AS username`;
    expect(target).toEqual({ database: 'zaping_test', username: 'ci' });

    const salt = randomBytes(5).toString('hex');
    ownerRole = 'zdo_' + salt;
    promoterRole = 'zdp_' + salt;
    unrelatedRole = 'zdu_' + salt;
    const promoterPwd = randomBytes(24).toString('hex');
    const unrelatedPwd = randomBytes(24).toString('hex');

    await db.$executeRawUnsafe(`CREATE ROLE "${ownerRole}" NOLOGIN NOINHERIT`);
    await db.$executeRawUnsafe(
      `CREATE ROLE "${promoterRole}" LOGIN NOINHERIT PASSWORD '${promoterPwd}'`,
    );
    await db.$executeRawUnsafe(
      `CREATE ROLE "${unrelatedRole}" LOGIN NOINHERIT PASSWORD '${unrelatedPwd}'`,
    );
    await db.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO "${ownerRole}", "${promoterRole}", "${unrelatedRole}"`,
    );
    await db.$executeRawUnsafe(
      `GRANT SELECT ON "SupplierAttachmentScanJob", "SupplierAttachmentScanReceipt", "SupplierDocumentAttachment", "SupplierDocument" TO "${ownerRole}"`,
    );
    await db.$executeRawUnsafe(
      `ALTER FUNCTION public."read_zfiles_promotion_candidate"(uuid,text) OWNER TO "${ownerRole}"`,
    );
    await db.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION public."read_zfiles_promotion_candidate"(uuid,text) TO "${promoterRole}"`,
    );

    promoter = new PrismaClient({
      datasources: { db: { url: roleUrl(raw, promoterRole, promoterPwd) } },
    });
    unrelated = new PrismaClient({
      datasources: { db: { url: roleUrl(raw, unrelatedRole, unrelatedPwd) } },
    });
  });

  afterAll(async () => {
    await Promise.all([promoter?.$disconnect(), unrelated?.$disconnect()]);
    if (!db) return;
    if (ownerRole) {
      await db.$executeRawUnsafe(
        'ALTER FUNCTION public."read_zfiles_promotion_candidate"(uuid,text) OWNER TO ci',
      );
    }
    if (promoterRole) {
      await db.$executeRawUnsafe(
        `REVOKE EXECUTE ON FUNCTION public."read_zfiles_promotion_candidate"(uuid,text) FROM "${promoterRole}"`,
      );
    }
    if (ownerRole) {
      await db.$executeRawUnsafe(
        `REVOKE SELECT ON "SupplierAttachmentScanJob", "SupplierAttachmentScanReceipt", "SupplierDocumentAttachment", "SupplierDocument" FROM "${ownerRole}"`,
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
        name: '03D2A Synthetic Company',
        rfc: 'ZQA' + companyId.replaceAll('-', '').slice(0, 10),
      },
    });
    await db.user.create({
      data: {
        id: userId,
        companyId,
        firstName: 'Promoter',
        lastName: 'ReadOnly',
        email: userId + '@example.invalid',
        passwordHash: 'NOT_A_LOGIN',
        role: 'ADMIN',
      },
    });
    const supplier = await db.supplier.create({
      data: { companyId, name: '03D2A synthetic supplier' },
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
        storageKey: ['private', companyId, documentId, attachmentId].join('/'),
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
    expect(issued.jobId).toBeTruthy();
    return { companyId, documentId, attachmentId, ...issued };
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
      contentSha256: 'a'.repeat(64),
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

  function gateway() {
    return new ZfilesVerifiedChallengeGateway(
      new ZfilesPostgresChallengeEvidenceLabRepository(db),
      policy,
    );
  }

  it('grants dedicated promoter only scoped EXECUTE, not table reads or DML', async () => {
    const [grants] = await db.$queryRaw<
      { canExecute: boolean; canReadJobs: boolean; canReadReceipts: boolean;
        canUpdateAttachment: boolean; otherExec: boolean }[]
    >`SELECT
      has_function_privilege(${promoterRole},
        'public.read_zfiles_promotion_candidate(uuid,text)', 'EXECUTE')
        AS "canExecute",
      has_table_privilege(${promoterRole},
        '"SupplierAttachmentScanJob"', 'SELECT') AS "canReadJobs",
      has_table_privilege(${promoterRole},
        '"SupplierAttachmentScanReceipt"', 'SELECT') AS "canReadReceipts",
      has_table_privilege(${promoterRole},
        '"SupplierDocumentAttachment"', 'UPDATE') AS "canUpdateAttachment",
      has_function_privilege(${unrelatedRole},
        'public.read_zfiles_promotion_candidate(uuid,text)', 'EXECUTE')
        AS "otherExec"`;
    expect(grants).toEqual({
      canExecute: true,
      canReadJobs: false,
      canReadReceipts: false,
      canUpdateAttachment: false,
      otherExec: false,
    });
    await expect(
      promoter.$queryRaw`SELECT * FROM "SupplierAttachmentScanReceipt"`,
    ).rejects.toThrow();
    await expect(
      promoter.$executeRaw`UPDATE "SupplierDocumentAttachment"
        SET "status" = 'AVAILABLE'`,
    ).rejects.toThrow();
    await expect(
      unrelated.$queryRaw`SELECT public."read_zfiles_promotion_candidate"(
        ${randomUUID()}::uuid, ${randomUUID()}::text
      )`,
    ).rejects.toThrow();
  });

  it('returns only a scoped consumed CLEAN candidate and the intact signed envelope', async () => {
    const f = await fixture();
    const signed = evidence(f);
    await expect(gateway().verifyAndCommit(f.jobId, signed)).resolves.toEqual({
      status: 'VERIFIED_UNRELEASED',
      verdict: 'CLEAN_CANDIDATE',
    });
    const reader = new ZfilesPostgresPromotionCandidateReader(promoter);
    const result = await reader.load(f.jobId, f.companyId);
    expect(result).toMatchObject({
      jobId: f.jobId,
      companyId: f.companyId,
      documentId: f.documentId,
      attachmentId: f.attachmentId,
      requestNonce: f.requestNonce,
      jobStatus: 'CONSUMED',
      documentStatus: 'ACTIVE',
      attachmentStatus: 'PENDING_SCAN',
      receipt: {
        jobId: f.jobId,
        companyId: f.companyId,
        requestNonce: f.requestNonce,
        verdict: 'CLEAN_CANDIDATE',
        signedEnvelope: signed,
      },
    });
    const attachment = await db.supplierDocumentAttachment.findUniqueOrThrow({
      where: { id: f.attachmentId },
    });
    expect(attachment.status).toBe('PENDING_SCAN');
  });

  it('refuses wrong tenant, unknown job and not-yet-consumed challenge', async () => {
    const f = await fixture();
    const reader = new ZfilesPostgresPromotionCandidateReader(promoter);
    expect(await reader.load(f.jobId, randomUUID())).toBeNull();
    expect(await reader.load(randomUUID(), f.companyId)).toBeNull();
    expect(await reader.load(f.jobId, f.companyId)).toBeNull();
    await expect(reader.load('invalid', f.companyId)).rejects.toThrow();
  });

  it('returns null for malware even when the signature and receipt are valid', async () => {
    const f = await fixture();
    await expect(
      gateway().verifyAndCommit(f.jobId, evidence(f, 'MALWARE_DETECTED')),
    ).resolves.toMatchObject({ verdict: 'MALWARE_DETECTED' });
    const reader = new ZfilesPostgresPromotionCandidateReader(promoter);
    expect(await reader.load(f.jobId, f.companyId)).toBeNull();
  });

  it('does not grant UPDATE or release authority to the read-only function', async () => {
    const f = await fixture();
    await gateway().verifyAndCommit(f.jobId, evidence(f));
    const reader = new ZfilesPostgresPromotionCandidateReader(promoter);
    await reader.load(f.jobId, f.companyId);
    await reader.load(f.jobId, f.companyId);
    expect(
      (await db.supplierDocumentAttachment.findUniqueOrThrow({
        where: { id: f.attachmentId },
      })).status,
    ).toBe('PENDING_SCAN');
    await expect(
      db.supplierDocumentAttachment.update({
        where: { id: f.attachmentId },
        data: { status: 'AVAILABLE' },
      }),
    ).rejects.toThrow();
  });
});
