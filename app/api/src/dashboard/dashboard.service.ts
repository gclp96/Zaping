import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type RecentDocument = {
  id: string;
  folio: string;
  createdAt: Date;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A bounded feed of document creations, not a lifecycle/audit event log.
   * Each query is tenant-scoped and guarded by the same domain role matrix
   * used by Quotes, Sales, Purchases and Purchase Receipts.
   */
  async getRecentActivity(companyId: string, role: UserRole) {
    const canReadCommercial =
      role === UserRole.ADMIN ||
      role === UserRole.MANAGER ||
      role === UserRole.SALES;
    const canReadPurchases =
      role === UserRole.ADMIN ||
      role === UserRole.MANAGER ||
      role === UserRole.WAREHOUSE;
    const query = {
      where: { companyId },
      select: { id: true, folio: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
      take: 6,
    };

    const [quotes, sales, purchases, receipts] = (await Promise.all([
      canReadCommercial
        ? this.prisma.quote.findMany(query)
        : Promise.resolve([]),
      canReadCommercial
        ? this.prisma.sale.findMany(query)
        : Promise.resolve([]),
      canReadPurchases
        ? this.prisma.purchase.findMany(query)
        : Promise.resolve([]),
      canReadPurchases
        ? this.prisma.purchaseReceipt.findMany(query)
        : Promise.resolve([]),
    ])) as [RecentDocument[], RecentDocument[], RecentDocument[], RecentDocument[]];

    const activities = [
      ...quotes.map((document) => ({ type: 'QUOTE' as const, ...document })),
      ...sales.map((document) => ({ type: 'SALE' as const, ...document })),
      ...purchases.map((document) => ({
        type: 'PURCHASE' as const,
        ...document,
      })),
      ...receipts.map((document) => ({
        type: 'RECEIPT' as const,
        ...document,
      })),
    ];

    return activities
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          left.type.localeCompare(right.type) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, 6)
      .map(({ type, id, folio, createdAt }) => ({
        type,
        id,
        folio,
        createdAt: createdAt.toISOString(),
      }));
  }

  async get(companyId: string, role: UserRole) {
    const canReadCommercialMetrics = role !== UserRole.WAREHOUSE;
    const canReadPurchaseMetrics = role !== UserRole.SALES;
    const [
      totalCustomers,
      totalSuppliers,
      totalProducts,
      totalQuotes,
      totalPurchases,
      totalSales,
    ] = await Promise.all([
      this.prisma.customer.count({
        where: { companyId },
      }),

      this.prisma.supplier.count({
        where: { companyId },
      }),

      this.prisma.product.count({
        where: { companyId, isActive: true },
      }),

      canReadCommercialMetrics
        ? this.prisma.quote.count({
            where: { companyId },
          })
        : Promise.resolve(undefined),

      canReadPurchaseMetrics
        ? this.prisma.purchase.count({
            where: { companyId },
          })
        : Promise.resolve(undefined),

      canReadCommercialMetrics
        ? this.prisma.sale.count({
            where: { companyId },
          })
        : Promise.resolve(undefined),
    ]);

    const lowStockProducts = await this.prisma.product.findMany({
      where: {
        companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        stock: true,
        minStock: true,
      },
    });

    const lowStock = lowStockProducts.filter(
      (product) => product.stock <= product.minStock,
    );

    const inventory = await this.prisma.product.findMany({
      where: { companyId, isActive: true },
      select: {
        stock: true,
        cost: true,
      },
    });

    const inventoryValue = inventory.reduce(
      (sum, product) => sum + product.stock * product.cost,
      0,
    );

    return {
      totals: {
        customers: totalCustomers,
        suppliers: totalSuppliers,
        products: totalProducts,
        ...(totalQuotes === undefined ? {} : { quotes: totalQuotes }),
        ...(totalPurchases === undefined ? {} : { purchases: totalPurchases }),
        ...(totalSales === undefined ? {} : { sales: totalSales }),
      },
      inventoryValue,
      lowStockProducts: lowStock.length,
      lowStock,
    };
  }
}
