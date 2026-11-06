import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, PurchaseReceiptAttachmentStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { PurchaseReceiptAttachmentsService } from '../src/purchases-receipts/purchase-receipt-attachments.service';

const describePg =
  process.env.RUN_ZFILES_RECEIPT_DIRECT_PG === '1' ? describe : describe.skip;

describePg('ZFILES-03E2 receipt-native attachment PostgreSQL boundary', () => {
  let db: PrismaClient;
  let service: PurchaseReceiptAttachmentsService;

  async function fixture(role: 'ADMIN' | 'WAREHOUSE' = 'ADMIN') {
    const companyId = randomUUID();
    const actorId = randomUUID();
    await db.company.create({
      data: { id: companyId, name: 'ZFILES direct receipt QA', rfc: companyId },
    });
    await db.user.create({
      data: {
        id: actorId,
        companyId,
        firstName: 'Receipt',
        lastName: 'QA',
        email: actorId + '@example.invalid',
        passwordHash: 'NOT_A_LOGIN',
        role,
      },
    });
    const supplier = await db.supplier.create({
      data: { companyId, name: 'Direct receipt fixture supplier' },
    });
    const purchase = await db.purchase.create({
      data: {
        companyId,
        supplierId: supplier.id,
        folio: randomUUID(),
        subtotal: 0,
        iva: 0,
        total: 0,
        status: 'CONFIRMED',
      },
    });
    const receipt = await db.purchaseReceipt.create({
      data: { companyId, purchaseId: purchase.id, folio: randomUUID() },
    });
    return { companyId, actorId, receiptId: receipt.id };
  }

  function pending(f: Awaited<ReturnType<typeof fixture>>) {
    const id = randomUUID();
    return {
      id,
      companyId: f.companyId,
      receiptId: f.receiptId,
      uploadedById: f.actorId,
      storageKey: `private/receipts/${f.companyId}/${f.receiptId}/${id}`,
      originalName: 'foto-entrega.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 110,
      sha256: 'a'.repeat(64),
    };
  }

  beforeAll(async () => {
    const raw = process.env.DATABASE_URL;
    if (
      !raw ||
      process.env.CI !== 'true' ||
      process.env.GITHUB_ACTIONS !== 'true'
    ) {
      throw new Error('Receipt direct attachment QA requires ephemeral CI DB');
    }
    const url = new URL(raw);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.port !== '5432' ||
      url.pathname !== '/zaping_test' ||
      url.username !== 'ci'
    ) {
      throw new Error('Unsafe receipt attachment DB target');
    }
    db = new PrismaClient({ datasources: { db: { url: raw } } });
    const [identity] = await db.$queryRaw<
      { database: string; role: string }[]
    >`SELECT current_database() AS database, current_user AS role`;
    expect(identity).toEqual({ database: 'zaping_test', role: 'ci' });
    service = new PurchaseReceiptAttachmentsService(
      db as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('stores PENDING_SCAN metadata directly against a receipt without any supplier document', async () => {
    const f = await fixture();
    const data = pending(f);
    const created = await db.purchaseReceiptAttachment.create({ data });
    expect(created.status).toBe(PurchaseReceiptAttachmentStatus.PENDING_SCAN);
    expect(created.scanEngine).toBeNull();
    expect(created.scannedAt).toBeNull();
    expect(
      await db.supplierDocument.count({ where: { companyId: f.companyId } }),
    ).toBe(0);
    const visible = await service.list(f.companyId, f.actorId, f.receiptId);
    expect(visible.map((row) => row.id)).toContain(created.id);
    expect(Object.keys(visible[0]).sort()).toEqual([
      'contentType',
      'createdAt',
      'id',
      'originalName',
      'sizeBytes',
      'status',
    ]);
  });

  it('rejects cross-tenant receipt or uploader references', async () => {
    const a = await fixture();
    const b = await fixture();
    await expect(
      db.purchaseReceiptAttachment.create({
        data: { ...pending(a), receiptId: b.receiptId },
      }),
    ).rejects.toThrow();
    await expect(
      db.purchaseReceiptAttachment.create({
        data: { ...pending(a), uploadedById: b.actorId },
      }),
    ).rejects.toThrow();
  });

  it('rejects forged availability, scanner timestamps, updates and deletes', async () => {
    const f = await fixture();
    await expect(
      db.purchaseReceiptAttachment.create({
        data: {
          ...pending(f),
          status: PurchaseReceiptAttachmentStatus.AVAILABLE,
          scanEngine: 'fake-clamav',
          scannedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.purchaseReceiptAttachment.create({
        data: { ...pending(f), scannedAt: new Date() },
      }),
    ).rejects.toThrow();
    const valid = await db.purchaseReceiptAttachment.create({
      data: pending(f),
    });
    await expect(
      db.purchaseReceiptAttachment.update({
        where: { id: valid.id },
        data: {
          status: PurchaseReceiptAttachmentStatus.AVAILABLE,
          scanEngine: 'fake-clamav',
          scannedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.purchaseReceiptAttachment.delete({ where: { id: valid.id } }),
    ).rejects.toThrow();
    const persisted = await db.purchaseReceiptAttachment.findUniqueOrThrow({
      where: { id: valid.id },
    });
    expect(persisted.status).toBe(PurchaseReceiptAttachmentStatus.PENDING_SCAN);
  });

  it('rejects foreign tenant lookups and non-management actor', async () => {
    const a = await fixture();
    const b = await fixture();
    await db.purchaseReceiptAttachment.create({ data: pending(a) });
    await expect(
      service.list(b.companyId, b.actorId, a.receiptId),
    ).rejects.toBeInstanceOf(NotFoundException);
    const warehouse = await fixture('WAREHOUSE');
    await expect(
      service.list(warehouse.companyId, warehouse.actorId, warehouse.receiptId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects wrong storage path, MIME, size and duplicate private key', async () => {
    const f = await fixture();
    const valid = pending(f);
    await db.purchaseReceiptAttachment.create({ data: valid });
    for (const change of [
      { storageKey: valid.storageKey },
      {
        storageKey:
          'private/' + f.companyId + '/' + f.receiptId + '/' + randomUUID(),
      },
      { storageKey: 'quarantine/receipts/' + f.companyId },
      { contentType: 'text/plain' },
      { sizeBytes: 0 },
      { sizeBytes: 10485761 },
      { sha256: 'not-a-digest' },
      { originalName: '../unsafe.jpg' },
    ]) {
      await expect(
        db.purchaseReceiptAttachment.create({
          data: { ...pending(f), ...change },
        }),
      ).rejects.toThrow();
    }
  });
});
