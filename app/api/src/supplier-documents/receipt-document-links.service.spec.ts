import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ReceiptDocumentLinksService } from './receipt-document-links.service';

describe('ReceiptDocumentLinksService', () => {
  const companyId = 'company-a';
  const actorId = 'actor-a';
  const receiptId = 'receipt-a';
  const documentId = 'document-a';

  const links = {
    createMany: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  };
  const tx = {
    $queryRaw: jest.fn(),
    purchaseReceipt: { findFirst: jest.fn() },
    supplierDocument: { findFirst: jest.fn() },
    purchaseReceiptSupplierDocumentLink: links,
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const service = new ReceiptDocumentLinksService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: 'supplier-a' }]);
    tx.purchaseReceipt.findFirst.mockResolvedValue({
      id: receiptId,
      purchaseId: 'purchase-a',
      purchase: { supplierId: 'supplier-a' },
    });
    tx.supplierDocument.findFirst.mockResolvedValue({
      id: documentId,
      supplierId: 'supplier-a',
      status: 'ACTIVE',
    });
    links.createMany.mockResolvedValue({ count: 1 });
    links.findFirst.mockResolvedValue({
      id: 'link-a',
      removedAt: null,
    });
  });

  it('requires a receipt inside the requesting tenant', async () => {
    tx.purchaseReceipt.findFirst.mockResolvedValue(null);
    await expect(
      service.link(companyId, actorId, receiptId, documentId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.purchaseReceipt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: receiptId, companyId } }),
    );
    expect(links.createMany).not.toHaveBeenCalled();
  });

  it('rejects missing documents in the current tenant', async () => {
    tx.supplierDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.link(companyId, actorId, receiptId, documentId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.supplierDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: documentId, companyId } }),
    );
  });

  it('rejects suppliers mismatched with the receipt purchase', async () => {
    tx.supplierDocument.findFirst.mockResolvedValue({
      id: documentId,
      supplierId: 'supplier-b',
      status: 'ACTIVE',
    });
    await expect(
      service.link(companyId, actorId, receiptId, documentId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(links.createMany).not.toHaveBeenCalled();
  });

  it('rejects cancelled documents', async () => {
    tx.supplierDocument.findFirst.mockResolvedValue({
      id: documentId,
      supplierId: 'supplier-a',
      status: 'CANCELLED',
    });
    await expect(
      service.link(companyId, actorId, receiptId, documentId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('locks the supplier before reading the document status', async () => {
    await service.link(companyId, actorId, receiptId, documentId);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.supplierDocument.findFirst.mock.invocationCallOrder[0],
    );
  });

  it('uses ReadCommitted explicitly for both write operations', async () => {
    await service.link(companyId, actorId, receiptId, documentId);
    links.updateMany.mockResolvedValueOnce({ count: 1 });
    await service.unlink(
      companyId,
      actorId,
      receiptId,
      documentId,
      'Documento incorrecto',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    for (const call of prisma.$transaction.mock.calls) {
      expect(call).toEqual([
        expect.any(Function),
        { isolationLevel: 'ReadCommitted' },
      ]);
    }
  });

  it('rejects linking when the supplier lock finds no tenant-owned supplier', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(
      service.link(companyId, actorId, receiptId, documentId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.supplierDocument.findFirst).not.toHaveBeenCalled();
    expect(links.createMany).not.toHaveBeenCalled();
  });

  it('creates an active nonmonetary link using company and supplier', async () => {
    await service.link(companyId, actorId, receiptId, documentId);
    expect(links.createMany).toHaveBeenCalledWith({
      data: [
        {
          companyId,
          purchaseId: 'purchase-a',
          supplierId: 'supplier-a',
          receiptId,
          documentId,
          createdById: actorId,
        },
      ],
      skipDuplicates: true,
    });
    expect(links.findFirst).toHaveBeenCalledWith({
      where: { companyId, receiptId, documentId, removedAt: null },
    });
  });

  it('replays an active link without a second row', async () => {
    links.createMany.mockResolvedValue({ count: 0 });
    await expect(
      service.link(companyId, actorId, receiptId, documentId),
    ).resolves.toMatchObject({ id: 'link-a' });
    expect(links.createMany).toHaveBeenCalledTimes(1);
    expect(links.findFirst).toHaveBeenCalledTimes(1);
  });

  it('does not lose a removed link history when relinking', async () => {
    const old = { id: 'historical-link', removedAt: new Date() };
    links.findFirst.mockResolvedValue({ id: 'new-link', removedAt: null });
    await expect(
      service.link(companyId, actorId, receiptId, documentId),
    ).resolves.toMatchObject({ id: 'new-link' });
    expect(links.createMany).toHaveBeenCalled();
    expect(old.removedAt).not.toBeNull();
  });

  it('does not list links if the receipt is missing', async () => {
    tx.purchaseReceipt.findFirst.mockResolvedValue(null);
    await expect(service.list(companyId, receiptId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(links.findMany).not.toHaveBeenCalled();
  });

  it('lists only active tenant-scoped links', async () => {
    links.findMany.mockResolvedValue([]);
    await service.list(companyId, receiptId);
    expect(links.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId, receiptId, removedAt: null },
      }),
    );
  });

  it('requires a substantive reason before unlinking', async () => {
    await expect(
      service.unlink(companyId, actorId, receiptId, documentId, '   '),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(links.updateMany).not.toHaveBeenCalled();
  });

  it('closes the active link while retaining an audit reason', async () => {
    links.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.unlink(
        companyId,
        actorId,
        receiptId,
        documentId,
        '  Remisión equivocada  ',
      ),
    ).resolves.toEqual({ unlinked: true });
    expect(links.updateMany).toHaveBeenCalledWith({
      where: { companyId, receiptId, documentId, removedAt: null },
      data: {
        removedAt: expect.any(Date) as Date,
        removedById: actorId,
        reason: 'Remisión equivocada',
      },
    });
  });

  it('prevents unlinking a nonexistent active association', async () => {
    links.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.unlink(
        companyId,
        actorId,
        receiptId,
        documentId,
        'Remisión equivocada',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
