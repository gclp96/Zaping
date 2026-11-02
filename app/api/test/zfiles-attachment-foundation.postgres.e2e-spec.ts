import { randomUUID } from 'node:crypto';
import {
  PrismaClient,
  SupplierDocumentAttachmentStatus,
  SupplierDocumentType,
} from '@prisma/client';

const describePg =
  process.env.RUN_ZFILES_ATTACHMENT_FOUNDATION_PG === '1'
    ? describe
    : describe.skip;

describePg('ZFILES-R2-01 private attachment PostgreSQL security', () => {
  let db: PrismaClient;

  async function fixture() {
    const companyId = randomUUID();
    const actorId = randomUUID();
    await db.company.create({
      data: { id: companyId, name: 'ZFILES isolated fixture', rfc: companyId },
    });
    await db.user.create({
      data: {
        id: actorId,
        companyId,
        firstName: 'ZFILES',
        lastName: 'QA',
        email: actorId + '@example.invalid',
        passwordHash: 'NOT_A_LOGIN',
        role: 'ADMIN',
      },
    });
    const supplier = await db.supplier.create({
      data: { companyId, name: 'ZFILES QA supplier' },
    });
    const document = await db.supplierDocument.create({
      data: {
        companyId,
        supplierId: supplier.id,
        createdById: actorId,
        type: SupplierDocumentType.REMISION,
        number: randomUUID(),
        normalizedNumber: randomUUID(),
        documentDate: new Date('2026-10-26T00:00:00.000Z'),
      },
    });
    return { companyId, actorId, documentId: document.id };
  }

  function metadata(f: Awaited<ReturnType<typeof fixture>>) {
    return {
      companyId: f.companyId,
      documentId: f.documentId,
      uploadedById: f.actorId,
      storageKey: 'qa/' + randomUUID() + '/private/' + randomUUID(),
      originalName: 'evidencia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 12,
      sha256: 'a'.repeat(64),
    };
  }

  beforeAll(async () => {
    const raw = process.env.DATABASE_URL;
    const isCi = process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true';
    if (!raw || !isCi) {
      throw new Error('ZFILES E2E requires ephemeral GitHub Actions');
    }
    const target = new URL(raw);
    if (
      !['localhost', '127.0.0.1'].includes(target.hostname) ||
      target.port !== '5432' ||
      target.pathname !== '/zaping_test' ||
      target.username !== 'ci'
    ) {
      throw new Error('Unsafe ZFILES PostgreSQL target');
    }
    db = new PrismaClient({ datasources: { db: { url: raw } } });
    const [identity] = await db.$queryRaw<
      { database: string; role: string }[]
    >`SELECT current_database() AS database, current_user AS role`;
    expect(identity).toEqual({ database: 'zaping_test', role: 'ci' });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('creates pending metadata without bytes or URLs', async () => {
    const f = await fixture();
    const row = await db.supplierDocumentAttachment.create({
      data: metadata(f),
    });
    expect(row.status).toBe(SupplierDocumentAttachmentStatus.PENDING_SCAN);
    expect(row.scanEngine).toBeNull();
    expect(row.scannedAt).toBeNull();
    const fields = Object.keys(row);
    expect(fields).not.toContain('bytes');
    expect(fields).not.toContain('publicUrl');
  });

  it('rejects forged AVAILABLE and scan fields', async () => {
    const f = await fixture();
    await expect(
      db.supplierDocumentAttachment.create({
        data: {
          ...metadata(f),
          status: SupplierDocumentAttachmentStatus.AVAILABLE,
          scanEngine: 'forged-clean',
          scannedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.supplierDocumentAttachment.create({
        data: { ...metadata(f), scanEngine: 'fake', scannedAt: new Date() },
      }),
    ).rejects.toThrow();
  });

  it('rejects forged promotion via Prisma and raw SQL', async () => {
    const f = await fixture();
    const row = await db.supplierDocumentAttachment.create({
      data: metadata(f),
    });
    await expect(
      db.supplierDocumentAttachment.update({
        where: { id: row.id },
        data: {
          status: SupplierDocumentAttachmentStatus.AVAILABLE,
          scanEngine: 'ci-fake-clean',
          scannedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`
        UPDATE "SupplierDocumentAttachment"
           SET "status" = 'AVAILABLE'::"SupplierDocumentAttachmentStatus",
               "scanEngine" = 'spoof', "scannedAt" = NOW()
         WHERE "id" = ${row.id}
      `,
    ).rejects.toThrow();
    const persisted = await db.supplierDocumentAttachment.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(persisted.status).toBe(
      SupplierDocumentAttachmentStatus.PENDING_SCAN,
    );
    expect(persisted.scanEngine).toBeNull();
  });

  it('rejects metadata changes and physical deletion', async () => {
    const f = await fixture();
    const row = await db.supplierDocumentAttachment.create({
      data: metadata(f),
    });
    await expect(
      db.supplierDocumentAttachment.update({
        where: { id: row.id },
        data: { storageKey: 'altered', sha256: 'b'.repeat(64) },
      }),
    ).rejects.toThrow();
    await expect(
      db.supplierDocumentAttachment.update({
        where: { id: row.id },
        data: { originalName: 'altered.pdf' },
      }),
    ).rejects.toThrow();
    await expect(
      db.supplierDocumentAttachment.delete({ where: { id: row.id } }),
    ).rejects.toThrow();
    expect(
      await db.supplierDocumentAttachment.findUniqueOrThrow({
        where: { id: row.id },
      }),
    ).toMatchObject({ storageKey: row.storageKey, sha256: row.sha256 });
  });

  it('enforces composite tenant FKs for documents and uploaders', async () => {
    const a = await fixture();
    const b = await fixture();
    await expect(
      db.supplierDocumentAttachment.create({
        data: { ...metadata(a), documentId: b.documentId },
      }),
    ).rejects.toThrow();
    await expect(
      db.supplierDocumentAttachment.create({
        data: { ...metadata(a), uploadedById: b.actorId },
      }),
    ).rejects.toThrow();
  });

  it('rejects invalid MIME, size, SHA and duplicate keys', async () => {
    const f = await fixture();
    const valid = metadata(f);
    await db.supplierDocumentAttachment.create({ data: valid });
    for (const change of [
      { contentType: 'image/svg+xml' },
      { sizeBytes: 0 },
      { sizeBytes: 10 * 1024 * 1024 + 1 },
      { sha256: 'INVALID' },
      { originalName: '../unsafe.pdf' },
      { storageKey: valid.storageKey },
    ]) {
      await expect(
        db.supplierDocumentAttachment.create({
          data: { ...metadata(f), ...change },
        }),
      ).rejects.toThrow();
    }
  });
});
