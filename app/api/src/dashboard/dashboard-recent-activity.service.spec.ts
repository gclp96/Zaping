import { UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

type ActivityRecord = {
  id: string;
  folio: string;
  createdAt: Date;
};

function document(id: string, createdAt: string): ActivityRecord {
  return {
    id,
    folio: 'FOL-' + id,
    createdAt: new Date(createdAt),
  };
}

describe('DashboardService recent activity', () => {
  const companyId = 'company-a';
  let service: DashboardService;
  let prisma: {
    quote: { findMany: jest.Mock };
    sale: { findMany: jest.Mock };
    purchase: { findMany: jest.Mock };
    purchaseReceipt: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      quote: { findMany: jest.fn().mockResolvedValue([]) },
      sale: { findMany: jest.fn().mockResolvedValue([]) },
      purchase: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseReceipt: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new DashboardService(prisma as unknown as PrismaService);
  });

  it('combines four tenant-scoped, bounded collections in newest-first order', async () => {
    prisma.quote.findMany.mockResolvedValue([
      document('q1', '2026-11-18T17:00:00.000Z'),
      document('q2', '2026-11-17T17:00:00.000Z'),
    ]);
    prisma.sale.findMany.mockResolvedValue([
      document('s1', '2026-11-18T18:00:00.000Z'),
    ]);
    prisma.purchase.findMany.mockResolvedValue([
      document('p1', '2026-11-18T19:00:00.000Z'),
    ]);
    prisma.purchaseReceipt.findMany.mockResolvedValue([
      document('r1', '2026-11-18T20:00:00.000Z'),
    ]);

    const result = await service.getRecentActivity(companyId, UserRole.ADMIN);

    expect(result).toEqual([
      { type: 'RECEIPT', id: 'r1', folio: 'FOL-r1', createdAt: '2026-11-18T20:00:00.000Z' },
      { type: 'PURCHASE', id: 'p1', folio: 'FOL-p1', createdAt: '2026-11-18T19:00:00.000Z' },
      { type: 'SALE', id: 's1', folio: 'FOL-s1', createdAt: '2026-11-18T18:00:00.000Z' },
      { type: 'QUOTE', id: 'q1', folio: 'FOL-q1', createdAt: '2026-11-18T17:00:00.000Z' },
      { type: 'QUOTE', id: 'q2', folio: 'FOL-q2', createdAt: '2026-11-17T17:00:00.000Z' },
    ]);

    for (const query of [
      prisma.quote.findMany,
      prisma.sale.findMany,
      prisma.purchase.findMany,
      prisma.purchaseReceipt.findMany,
    ]) {
      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith({
        where: { companyId },
        select: { id: true, folio: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 6,
      });
    }
  });

  it('does not query or expose sales and quotes for WAREHOUSE', async () => {
    prisma.purchase.findMany.mockResolvedValue([
      document('p1', '2026-11-18T12:00:00.000Z'),
    ]);

    const result = await service.getRecentActivity(companyId, UserRole.WAREHOUSE);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('PURCHASE');
    expect(prisma.quote.findMany).not.toHaveBeenCalled();
    expect(prisma.sale.findMany).not.toHaveBeenCalled();
    expect(prisma.purchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId } }),
    );
    expect(prisma.purchaseReceipt.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not query or expose purchases and receipts for SALES', async () => {
    prisma.quote.findMany.mockResolvedValue([
      document('q1', '2026-11-18T12:00:00.000Z'),
    ]);

    const result = await service.getRecentActivity(companyId, UserRole.SALES);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('QUOTE');
    expect(prisma.purchase.findMany).not.toHaveBeenCalled();
    expect(prisma.purchaseReceipt.findMany).not.toHaveBeenCalled();
    expect(prisma.quote.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sale.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps at most six records and breaks timestamp ties deterministically', async () => {
    prisma.quote.findMany.mockResolvedValue([
      ...Array.from({ length: 6 }, (_, i) => document(
        'q' + String(i),
        '2026-11-18T12:00:00.000Z',
      )),
    ]);
    prisma.sale.findMany.mockResolvedValue([
      document('s1', '2026-11-18T12:00:00.000Z'),
    ]);

    const result = await service.getRecentActivity(companyId, UserRole.MANAGER);

    expect(result).toHaveLength(6);
    expect(result.map((item) => item.id)).toEqual([
      'q0', 'q1', 'q2', 'q3', 'q4', 'q5',
    ]);
  });

  it('returns an empty feed when no documents exist', async () => {
    await expect(
      service.getRecentActivity(companyId, UserRole.ADMIN),
    ).resolves.toEqual([]);
  });
});
