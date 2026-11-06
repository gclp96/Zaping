import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PurchaseReceiptAttachmentsService } from './purchase-receipt-attachments.service';

describe('receipt-owned attachment list boundary', () => {
  const prisma = {
    user: { findFirst: jest.fn() },
    purchaseReceipt: { findFirst: jest.fn() },
    purchaseReceiptAttachment: { findMany: jest.fn() },
  };
  const service = new PurchaseReceiptAttachmentsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findFirst.mockResolvedValue({ role: 'ADMIN' });
    prisma.purchaseReceipt.findFirst.mockResolvedValue({ id: 'receipt-a' });
    prisma.purchaseReceiptAttachment.findMany.mockResolvedValue([]);
  });

  it('denies missing, inactive and non-management actors', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.list('company-a', 'actor-a', 'receipt-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findFirst.mockResolvedValue({ role: 'WAREHOUSE' });
    await expect(
      service.list('company-a', 'actor-a', 'receipt-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.purchaseReceipt.findFirst).not.toHaveBeenCalled();
    expect(prisma.purchaseReceiptAttachment.findMany).not.toHaveBeenCalled();
  });

  it('never lists another tenant receipt', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(null);
    await expect(
      service.list('company-b', 'actor-b', 'receipt-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.purchaseReceipt.findFirst).toHaveBeenCalledWith({
      where: { id: 'receipt-a', companyId: 'company-b' },
      select: { id: true },
    });
    expect(prisma.purchaseReceiptAttachment.findMany).not.toHaveBeenCalled();
  });

  it('returns only allowed metadata without a SupplierDocument or any R2 object fields', async () => {
    await expect(
      service.list('company-a', 'actor-a', 'receipt-a'),
    ).resolves.toEqual([]);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'actor-a', companyId: 'company-a', isActive: true },
      select: { role: true },
    });
    expect(prisma.purchaseReceiptAttachment.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-a', receiptId: 'receipt-a' },
      select: {
        id: true,
        originalName: true,
        contentType: true,
        sizeBytes: true,
        status: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
    });
  });
});
