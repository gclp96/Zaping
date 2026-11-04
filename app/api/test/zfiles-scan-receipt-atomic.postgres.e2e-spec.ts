import { PrismaClient, SupplierDocumentAttachmentStatus } from '@prisma/client';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import {
  signScanEvidence,
  type EvidenceVerificationPolicy,
  type ScanEvidenceClaims,
} from '../src/config/zfiles-signed-scan-evidence-lab';
import { ZfilesVerifiedChallengeGateway } from '../src/config/zfiles-verified-challenge-gateway-lab';
import { ZfilesPostgresChallengeEvidenceLabRepository } from '../src/config/zfiles-postgres-scan-evidence-lab-repository';

const describePg =
  process.env.RUN_ZFILES_SCAN_RECEIPT_PG === '1' ? describe : describe.skip;

describePg('ZFILES-R2-03C2B2 atomic signed receipt PostgreSQL QA', () => {
  let ownerDb: PrismaClient;
  let verifierA: PrismaClient;
  let verifierB: PrismaClient;
  let unrelated: PrismaClient;
  let ownerRole: string;
  let verifierRole: string;
  let unrelatedRole: string;
  const keyPair = generateKeyPairSync('ed25519');
  const policy: EvidenceVerificationPolicy = {
    trustedKeys: new Map([
      [
        'qa-verifier',
        {
          publicKey: keyPair.publicKey,
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

  function roleName(prefix: string) {
    return prefix + randomBytes(5).toString('hex');
  }

  function roleUrl(raw: string, role: string, password: string) {
    const target = new URL(raw);
    target.username = role;
    target.password = password;
    return target.toString();
  }

  beforeAll(async () => {
    const raw = process.env.DATABASE_URL ?? '';
    const target = new URL(raw);
    if (
      process.env.CI !== 'true' ||
      process.env.GITHUB_ACTIONS !== 'true' ||
      !['localhost', '127.0.0.1'].includes(target.hostname) ||
      target.port !== '5432' ||
      target.pathname !== '/zaping_test' ||
      target.username !== 'ci'
    ) {
      throw new Error('03C2B2 tests require disposable CI PostgreSQL only');
    }

    ownerDb = new PrismaClient({ datasources: { db: { url: raw } } });
    const [identity] = await ownerDb.$queryRaw<
      { database: string; username: string }[]
    >`SELECT current_database() AS database, current_user AS username`;
    expect(identity).toEqual({ database: 'zaping_test', username: 'ci' });

    ownerRole = roleName('zso_');
    verifierRole = roleName('zsv_');
    unrelatedRole = roleName('zsu_');
    const verifierPassword = randomBytes(32).toString('hex');
    const unrelatedPassword = randomBytes(32).toString('hex');

    // Roles exist ONLY inside the disposable PostgreSQL service.
    await ownerDb.$executeRawUnsafe(
      `CREATE ROLE "${ownerRole}" NOLOGIN NOINHERIT`,
    );
    await ownerDb.$executeRawUnsafe(
      `CREATE ROLE "${verifierRole}" LOGIN NOINHERIT PASSWORD '${verifierPassword}'`,
    );
    await ownerDb.$executeRawUnsafe(
      `CREATE ROLE "${unrelatedRole}" LOGIN NOINHERIT PASSWORD '${unrelatedPassword}'`,
    );

    await ownerDb.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO "${ownerRole}", "${verifierRole}", "${unrelatedRole}"`,
    );
    await ownerDb.$executeRawUnsafe(
      `GRANT SELECT, UPDATE ON "SupplierAttachmentScanJob" TO "${ownerRole}"`,
    );
    await ownerDb.$executeRawUnsafe(
      `GRANT SELECT, INSERT ON "SupplierAttachmentScanReceipt" TO "${ownerRole}"`,
    );
    await ownerDb.$executeRawUnsafe(
      `GRANT SELECT ON "SupplierDocumentAttachment", "SupplierDocument" TO "${ownerRole}"`,
    );
    await ownerDb.$executeRawUnsafe(
      `GRANT USAGE ON TYPE "SupplierAttachmentScanJobStatus" TO "${ownerRole}"`,
    );

    // SECURITY DEFINER now executes under a genuine NOLOGIN, non-superuser
    // with only the table privileges needed by these functions.
    await ownerDb.$executeRawUnsafe(
      `ALTER FUNCTION "read_zfiles_scan_challenge"(uuid) OWNER TO "${ownerRole}"`,
    );
    await ownerDb.$executeRawUnsafe(
      `ALTER FUNCTION "commit_zfiles_verified_scan"(uuid,text,uuid,jsonb) OWNER TO "${ownerRole}"`,
    );
    await ownerDb.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION "read_zfiles_scan_challenge"(uuid) TO "${verifierRole}"`,
    );
    await ownerDb.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION "commit_zfiles_verified_scan"(uuid,text,uuid,jsonb) TO "${verifierRole}"`,
    );

    const verifierUrl = roleUrl(raw, verifierRole, verifierPassword);
    verifierA = new PrismaClient({
      datasources: { db: { url: verifierUrl } },
    });
    verifierB = new PrismaClient({
      datasources: { db: { url: verifierUrl } },
    });
    unrelated = new PrismaClient({
      datasources: {
        db: { url: roleUrl(raw, unrelatedRole, unrelatedPassword) },
      },
    });
  });

  afterAll(async () => {
    await Promise.all([
      verifierA?.$disconnect(),
      verifierB?.$disconnect(),
      unrelated?.$disconnect(),
    ]);
    if (ownerDb) {
      // Return function ownership to the ephemeral CI superuser before
      // dropping temporary roles; no runtime GRANT remains in the migration.
      if (ownerRole) {
        await ownerDb.$executeRawUnsafe(
          'ALTER FUNCTION "read_zfiles_scan_challenge"(uuid) OWNER TO ci',
        );
        await ownerDb.$executeRawUnsafe(
          'ALTER FUNCTION "commit_zfiles_verified_scan"(uuid,text,uuid,jsonb) OWNER TO ci',
        );
      }
      if (verifierRole) {
        await ownerDb.$executeRawUnsafe(
          `REVOKE EXECUTE ON FUNCTION "read_zfiles_scan_challenge"(uuid) FROM "${verifierRole}"`,
        );
        await ownerDb.$executeRawUnsafe(
          `REVOKE EXECUTE ON FUNCTION "commit_zfiles_verified_scan"(uuid,text,uuid,jsonb) FROM "${verifierRole}"`,
        );
      }
      if (ownerRole) {
        await ownerDb.$executeRawUnsafe(
          `REVOKE ALL ON "SupplierAttachmentScanJob", "SupplierAttachmentScanReceipt", "SupplierDocumentAttachment", "SupplierDocument" FROM "${ownerRole}"`,
        );
        await ownerDb.$executeRawUnsafe(
          `REVOKE USAGE ON TYPE "SupplierAttachmentScanJobStatus" FROM "${ownerRole}"`,
        );
      }
      for (const role of [verifierRole, unrelatedRole, ownerRole]) {
        if (!role) continue;
        await ownerDb.$executeRawUnsafe(
          `REVOKE USAGE ON SCHEMA public FROM "${role}"`,
        );
        await ownerDb.$executeRawUnsafe(`DROP ROLE "${role}"`);
      }
      await ownerDb.$disconnect();
    }
  });

  async function fixture() {
    const companyId = randomUUID();
    const documentId = randomUUID();
    const attachmentId = randomUUID();
    const userId = randomUUID();
    await ownerDb.company.create({
      data: {
        id: companyId,
        name: 'ZFILES 03C2B2 synthetic Company',
        rfc: 'ZQA' + companyId.replaceAll('-', '').slice(0, 10),
      },
    });
    await ownerDb.user.create({
      data: {
        id: userId,
        companyId,
        firstName: 'Scan',
        lastName: 'Transaction',
        email: userId + '@example.invalid',
        passwordHash: 'NOT_A_LOGIN',
        role: 'ADMIN',
      },
    });
    const supplier = await ownerDb.supplier.create({
      data: { companyId, name: 'Synthetic lab supplier' },
    });
    await ownerDb.supplierDocument.create({
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
    await ownerDb.supplierDocumentAttachment.create({
      data: {
        id: attachmentId,
        companyId,
        documentId,
        uploadedById: userId,
        storageKey: [
          'private',
          companyId,
          documentId,
          attachmentId,
        ].join('/'),
        originalName: 'synthetic.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 64,
        sha256: 'a'.repeat(64),
      },
    });
    const [issued] = await ownerDb.$queryRaw<
      { jobId: string; requestNonce: string }[]
    >`SELECT * FROM "issue_zfiles_scan_challenge"(
      ${companyId}::text, ${attachmentId}::text, 120::integer
    )`;
    expect(issued?.jobId).toBeTruthy();
    return { companyId, documentId, attachmentId, ...issued };
  }

  function evidence(f: Awaited<ReturnType<typeof fixture>>, verdict:
    'CLEAN_CANDIDATE' | 'MALWARE_DETECTED' = 'CLEAN_CANDIDATE') {
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
    return signScanEvidence(claims, 'qa-verifier', keyPair.privateKey);
  }

  function gateway(db: PrismaClient) {
    return new ZfilesVerifiedChallengeGateway(
      new ZfilesPostgresChallengeEvidenceLabRepository(db),
      policy,
    );
  }

  it('limits verifier LOGIN to two functions without table DML', async () => {
    const [v] = await verifierA.$queryRaw<
      { sessionUser: string; currentUser: string }[]
    >`SELECT session_user AS "sessionUser",
       current_user AS "currentUser"`;
    expect(v).toEqual({
      sessionUser: verifierRole,
      currentUser: verifierRole,
    });
    const [grants] = await ownerDb.$queryRaw<
      {
        canRead: boolean;
        canCommit: boolean;
        canIssue: boolean;
        tableRead: boolean;
        tableWrite: boolean;
        receiptWrite: boolean;
      }[]
    >`SELECT
       has_function_privilege(${verifierRole}, 'public.read_zfiles_scan_challenge(uuid)', 'EXECUTE') AS "canRead",
       has_function_privilege(${verifierRole}, 'public.commit_zfiles_verified_scan(uuid,text,uuid,jsonb)', 'EXECUTE') AS "canCommit",
       has_function_privilege(${verifierRole}, 'public.issue_zfiles_scan_challenge(text,text,integer)', 'EXECUTE') AS "canIssue",
       has_table_privilege(${verifierRole}, '"SupplierAttachmentScanJob"', 'SELECT') AS "tableRead",
       has_table_privilege(${verifierRole}, '"SupplierAttachmentScanJob"', 'UPDATE') AS "tableWrite",
       has_table_privilege(${verifierRole}, '"SupplierAttachmentScanReceipt"', 'INSERT') AS "receiptWrite"`;
    expect(grants).toEqual({
      canRead: true,
      canCommit: true,
      canIssue: false,
      tableRead: false,
      tableWrite: false,
      receiptWrite: false,
    });
    await expect(
      verifierA.$queryRaw`SELECT * FROM "SupplierAttachmentScanJob" LIMIT 1`,
    ).rejects.toThrow();
    await expect(
      verifierA.$executeRaw`UPDATE "SupplierAttachmentScanJob" SET "status" = 'CONSUMED'`,
    ).rejects.toThrow();
    await expect(
      verifierA.$executeRaw`DELETE FROM "SupplierAttachmentScanReceipt"`,
    ).rejects.toThrow();
    await expect(
      unrelated.$queryRaw`SELECT * FROM "read_zfiles_scan_challenge"(${randomUUID()}::uuid)`,
    ).rejects.toThrow();
    await expect(
      unrelated.$queryRaw`SELECT * FROM "commit_zfiles_verified_scan"(
        ${randomUUID()}::uuid, 'other', ${randomUUID()}::uuid, '{}'::jsonb
      )`,
    ).rejects.toThrow();
  });

  it('atomically saves an intact Ed25519 envelope and consumes the nonce', async () => {
    const f = await fixture();
    const signed = evidence(f);
    await expect(gateway(verifierA).verifyAndCommit(f.jobId, signed)).resolves.toEqual({
      status: 'VERIFIED_UNRELEASED',
      verdict: 'CLEAN_CANDIDATE',
    });
    const job = await ownerDb.supplierAttachmentScanJob.findUniqueOrThrow({
      where: { id: f.jobId },
    });
    const receipts = await ownerDb.supplierAttachmentScanReceipt.findMany({
      where: { jobId: f.jobId },
    });
    expect(job.status).toBe('CONSUMED');
    expect(job.consumedAt).not.toBeNull();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].verdict).toBe('CLEAN_CANDIDATE');
    expect(receipts[0].signedEnvelope).toEqual(signed);
    const attachment = await ownerDb.supplierDocumentAttachment.findUniqueOrThrow({
      where: { id: f.attachmentId },
    });
    expect(attachment.status).toBe('PENDING_SCAN');
    await expect(
      gateway(verifierA).verifyAndCommit(f.jobId, signed),
    ).rejects.toThrow('Evidencia de escaneo no autorizada');
    expect(
      await ownerDb.supplierAttachmentScanReceipt.count({
        where: { jobId: f.jobId },
      }),
    ).toBe(1);
  });

  it('serializes physically separate verifier connections; one winner', async () => {
    const f = await fixture();
    const signed = evidence(f);
    const pidA = await verifierA.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    const pidB = await verifierB.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    expect(pidA[0].pid).not.toBe(pidB[0].pid);
    const attempts = await Promise.allSettled([
      gateway(verifierA).verifyAndCommit(f.jobId, signed),
      gateway(verifierB).verifyAndCommit(f.jobId, signed),
    ]);
    expect(attempts.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((x) => x.status === 'rejected')).toHaveLength(1);
    const job = await ownerDb.supplierAttachmentScanJob.findUniqueOrThrow({
      where: { id: f.jobId },
    });
    expect(job.status).toBe('CONSUMED');
    expect(
      await ownerDb.supplierAttachmentScanReceipt.count({
        where: { jobId: f.jobId },
      }),
    ).toBe(1);
  });

  it('keeps MALWARE_DETECTED verified but never releases the attachment', async () => {
    const f = await fixture();
    const result = await gateway(verifierA).verifyAndCommit(
      f.jobId,
      evidence(f, 'MALWARE_DETECTED'),
    );
    expect(result).toEqual({
      status: 'VERIFIED_UNRELEASED',
      verdict: 'MALWARE_DETECTED',
    });
    const attachment = await ownerDb.supplierDocumentAttachment.findUniqueOrThrow({
      where: { id: f.attachmentId },
    });
    expect(attachment.status).toBe('PENDING_SCAN');
    await expect(
      ownerDb.supplierDocumentAttachment.update({
        where: { id: f.attachmentId },
        data: {
          status: SupplierDocumentAttachmentStatus.AVAILABLE,
          scannedAt: new Date(),
          scanEngine: 'untrusted',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects tampered Ed25519 evidence without storing a receipt', async () => {
    const f = await fixture();
    const signed = evidence(f);
    const tampered = {
      ...signed,
      claims: { ...signed.claims, contentSha256: 'f'.repeat(64) },
    };
    await expect(
      gateway(verifierA).verifyAndCommit(f.jobId, tampered),
    ).rejects.toThrow();
    expect(
      await ownerDb.supplierAttachmentScanReceipt.count({
        where: { jobId: f.jobId },
      }),
    ).toBe(0);
    expect(
      (await ownerDb.supplierAttachmentScanJob.findUniqueOrThrow({
        where: { id: f.jobId },
      })).status,
    ).toBe('ISSUED');
  });

  it('denies wrong company and nonce in SQL without consuming', async () => {
    const f = await fixture();
    const signed = evidence(f);
    const body = JSON.stringify(signed);
    const wrong = await verifierA.$queryRaw<{ accepted: boolean }[]>`
      SELECT "commit_zfiles_verified_scan"(
        ${f.jobId}::uuid,
        ${randomUUID()}::text,
        ${f.requestNonce}::uuid,
        ${body}::jsonb
      ) AS accepted
    `;
    expect(wrong).toEqual([{ accepted: false }]);
    const nonceWrong = await verifierA.$queryRaw<{ accepted: boolean }[]>`
      SELECT "commit_zfiles_verified_scan"(
        ${f.jobId}::uuid,
        ${f.companyId}::text,
        ${randomUUID()}::uuid,
        ${body}::jsonb
      ) AS accepted
    `;
    expect(nonceWrong).toEqual([{ accepted: false }]);
    expect(await ownerDb.supplierAttachmentScanReceipt.count({
      where: { jobId: f.jobId },
    })).toBe(0);
  });

  it('keeps receipts immutable and prevents reissue after consumption', async () => {
    const f = await fixture();
    await gateway(verifierA).verifyAndCommit(f.jobId, evidence(f));
    await expect(
      ownerDb.supplierAttachmentScanReceipt.delete({
        where: { jobId: f.jobId },
      }),
    ).rejects.toThrow();
    await expect(
      ownerDb.supplierAttachmentScanReceipt.update({
        where: { jobId: f.jobId },
        data: { verdict: 'MALWARE_DETECTED' },
      }),
    ).rejects.toThrow();
    await expect(ownerDb.$queryRaw`SELECT * FROM "issue_zfiles_scan_challenge"(
      ${f.companyId}::text, ${f.attachmentId}::text, 120::integer
    )`).rejects.toThrow();
  });
});
