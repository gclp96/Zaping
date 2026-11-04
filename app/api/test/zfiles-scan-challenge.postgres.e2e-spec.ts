import { PrismaClient, SupplierDocumentAttachmentStatus } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';

const describePg =
  process.env.RUN_ZFILES_SCAN_CHALLENGE_PG === '1'
    ? describe
    : describe.skip;

type Issued = {
  jobId: string;
  requestNonce: string;
  issuedAt: Date;
  expiresAt: Date;
};

describePg('ZFILES-R2-03C2A PostgreSQL issued-only challenge', () => {
  let db: PrismaClient;

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
      throw new Error('Scan challenge tests require disposable CI PostgreSQL');
    }
    db = new PrismaClient({ datasources: { db: { url: raw } } });
    const [session] = await db.$queryRawUnsafe<
      { database: string; role: string }[]
    >('SELECT current_database() AS database, current_user AS role');
    expect(session).toEqual({ database: 'zaping_test', role: 'ci' });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  async function fixture() {
    const companyId = randomUUID();
    const actorId = randomUUID();
    const documentId = randomUUID();
    const attachmentId = randomUUID();

    await db.company.create({
      data: {
        id: companyId,
        name: 'ZFILES 03C2A synthetic company',
        rfc: 'ZQA' + companyId.replaceAll('-', '').slice(0, 10),
      },
    });
    await db.user.create({
      data: {
        id: actorId,
        companyId,
        firstName: 'Scan',
        lastName: 'Laboratory',
        email: actorId + '@example.invalid',
        passwordHash: 'NOT_A_LOGIN',
        role: 'ADMIN',
      },
    });
    const supplier = await db.supplier.create({
      data: { companyId, name: 'Synthetic supplier' },
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
        createdById: actorId,
      },
    });
    await db.supplierDocumentAttachment.create({
      data: {
        id: attachmentId,
        companyId,
        documentId,
        uploadedById: actorId,
        storageKey: [
          'private',
          companyId,
          documentId,
          attachmentId,
        ].join('/'),
        originalName: 'synthetic.pdf',
        contentType: 'application/pdf',
        sizeBytes: 64,
        sha256: 'a'.repeat(64),
      },
    });
    return { companyId, documentId, attachmentId };
  }

  async function issue(companyId: string, attachmentId: string, ttl = 120) {
    const records = await db.$queryRawUnsafe<Issued[]>(
      'SELECT * FROM "issue_zfiles_scan_challenge"($1::text,$2::text,$3::integer)',
      companyId,
      attachmentId,
      ttl,
    );
    expect(records).toHaveLength(1);
    return records[0];
  }

  it('issues a database-generated challenge bound to immutable metadata', async () => {
    const f = await fixture();
    const issued = await issue(f.companyId, f.attachmentId);
    expect(issued.requestNonce).toMatch(/^[0-9a-f-]{36}$/u);
    expect(issued.expiresAt.getTime() - issued.issuedAt.getTime()).toBe(
      120_000,
    );
    const job = await db.supplierAttachmentScanJob.findUniqueOrThrow({
      where: { id: issued.jobId },
    });
    expect(job.status).toBe('ISSUED');
    expect(job.contentSha256).toBe('a'.repeat(64));
    expect(job.contentSizeBytes).toBe(64);
    expect(job.documentId).toBe(f.documentId);
    expect(job.quarantineKey).toBe(
      ['quarantine', f.companyId, f.documentId, f.attachmentId].join('/'),
    );
    expect(job.consumedAt).toBeNull();
  });

  it('rejects a cross-tenant issue, unknown attachments and invalid TTL', async () => {
    const f = await fixture();
    const other = await fixture();
    await expect(issue(other.companyId, f.attachmentId)).rejects.toThrow();
    await expect(issue(f.companyId, randomUUID())).rejects.toThrow();
    await expect(issue(f.companyId, f.attachmentId, 59)).rejects.toThrow();
    await expect(issue(f.companyId, f.attachmentId, 301)).rejects.toThrow();
    expect(
      await db.supplierAttachmentScanJob.count({
        where: { attachmentId: f.attachmentId },
      }),
    ).toBe(0);
  });

  it('serializes two competing issuers and prevents nonce reuse', async () => {
    const f = await fixture();
    const attempts = await Promise.allSettled([
      issue(f.companyId, f.attachmentId),
      issue(f.companyId, f.attachmentId),
    ]);
    expect(attempts.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((x) => x.status === 'rejected')).toHaveLength(1);
    expect(
      await db.supplierAttachmentScanJob.count({
        where: { companyId: f.companyId, attachmentId: f.attachmentId },
      }),
    ).toBe(1);
  });

  it('never permits direct consumption, edits, deletion or AVAILABLE', async () => {
    const f = await fixture();
    const issued = await issue(f.companyId, f.attachmentId);

    await expect(
      db.supplierAttachmentScanJob.update({
        where: { id: issued.jobId },
        data: { status: 'CONSUMED', consumedAt: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      db.supplierAttachmentScanJob.update({
        where: { id: issued.jobId },
        data: { status: 'EXPIRED' },
      }),
    ).rejects.toThrow();
    await expect(
      db.supplierAttachmentScanJob.update({
        where: { id: issued.jobId },
        data: { contentSha256: 'b'.repeat(64) },
      }),
    ).rejects.toThrow();
    await expect(
      db.supplierAttachmentScanJob.delete({ where: { id: issued.jobId } }),
    ).rejects.toThrow();
    await expect(
      db.supplierDocumentAttachment.update({
        where: { id: f.attachmentId },
        data: {
          status: SupplierDocumentAttachmentStatus.AVAILABLE,
          scannedAt: new Date(),
          scanEngine: 'forged-scanner',
        },
      }),
    ).rejects.toThrow();
  });

  it('denies real non-owner SQL login direct table and issuer access', async () => {
    const raw = process.env.DATABASE_URL ?? '';
    const name = 'zscan_lab_' + randomBytes(5).toString('hex');
    const secret = randomBytes(24).toString('hex');
    await db.$executeRawUnsafe(
      'CREATE ROLE "' + name + '" LOGIN NOINHERIT PASSWORD ' +
        "'" + secret + "'",
    );
    const target = new URL(raw);
    target.username = name;
    target.password = secret;
    const outsider = new PrismaClient({
      datasources: { db: { url: target.toString() } },
    });
    try {
      const [identity] = await outsider.$queryRawUnsafe<
        { sessionUser: string; currentUser: string }[]
      >(
        'SELECT session_user AS "sessionUser", ' +
          'current_user AS "currentUser"',
      );
      expect(identity).toEqual({ sessionUser: name, currentUser: name });
      const [grants] = await db.$queryRawUnsafe<
        { issue: boolean; insert: boolean; update: boolean }[]
      >(
        'SELECT ' +
          "has_function_privilege($1, " +
          "'public.issue_zfiles_scan_challenge(text,text,integer)'," +
          "'EXECUTE') AS issue, " +
          "has_table_privilege($1, '\"SupplierAttachmentScanJob\"'," +
          "'INSERT') AS insert, " +
          "has_table_privilege($1, '\"SupplierDocumentAttachment\"'," +
          "'UPDATE') AS update",
        name,
      );
      expect(grants).toEqual({
        issue: false,
        insert: false,
        update: false,
      });
      await expect(
        outsider.$executeRawUnsafe(
          'INSERT INTO "SupplierAttachmentScanJob" DEFAULT VALUES',
        ),
      ).rejects.toThrow(/permission denied/iu);
      await expect(
        outsider.$queryRawUnsafe(
          "SELECT * FROM issue_zfiles_scan_challenge('x','y',120)",
        ),
      ).rejects.toThrow(/permission denied/iu);
    } finally {
      await outsider.$disconnect();
      await db.$executeRawUnsafe('DROP ROLE "' + name + '"');
    }
  });
});
