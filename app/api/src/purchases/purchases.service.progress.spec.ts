import { PrismaService } from '../prisma/prisma.service';

import { PurchasesService } from './purchases.service';
import { PurchasesFolioService } from './purchases-folio.service';

function createPurchase(
  id: string,
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
  }>,
  status = 'CONFIRMED',
) {
  return {
    id,
    companyId: 'company-1',
    folio: `OC-${id}`,
    supplier: {
      id: `supplier-${id}`,
      name: 'Proveedor de prueba',
    },
    subtotal: 0,
    iva: 0,
    total: 0,
    status,
    createdAt: new Date('2026-08-29T00:00:00.000Z'),
    updatedAt: new Date('2026-08-29T00:00:00.000Z'),
    items: items.map((item) => ({
      ...item,
      price: 10,
      subtotal: item.quantity * 10,
      product: {
        id: item.productId,
        sku: `SKU-${item.productId}`,
        name: `Producto ${item.productId}`,
      },
    })),
  };
}

describe('PurchasesService — receipt progress', () => {
  let service: PurchasesService;
  let prismaMock: {
    purchase: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    purchaseReceiptItem: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      purchase: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      purchaseReceiptItem: {
        findMany: jest.fn(),
      },
    };

    service = new PurchasesService(
      prismaMock as unknown as PrismaService,
      {} as PurchasesFolioService,
    );
  });

  it.each(['findAll', 'findOne'] as const)(
    'preserves historical purchases with inactive catalogs through %s',
    async (method) => {
      const base = createPurchase('historical', [
        { id: 'historical-item', productId: 'product-1', quantity: 5 },
      ]);
      const purchase = {
        ...base,
        supplier: { ...base.supplier, isActive: false },
        items: base.items.map((item) => ({
          ...item,
          product: { ...item.product, isActive: false },
        })),
      };
      prismaMock.purchase.findMany.mockResolvedValue([purchase]);
      prismaMock.purchase.findFirst.mockResolvedValue(purchase);
      prismaMock.purchaseReceiptItem.findMany.mockResolvedValue([]);

      const result =
        method === 'findAll'
          ? (await service.findAll('company-1'))[0]
          : await service.findOne('company-1', purchase.id);

      expect(result).toMatchObject(purchase);
      expect(result.receiptProgress.pendingUnits).toBe(5);
      const query =
        method === 'findAll'
          ? prismaMock.purchase.findMany
          : prismaMock.purchase.findFirst;
      expect(query).toHaveBeenCalledWith({
        where:
          method === 'findAll'
            ? { companyId: 'company-1' }
            : { id: purchase.id, companyId: 'company-1' },
        include: { supplier: true, items: { include: { product: true } } },
        ...(method === 'findAll' ? { orderBy: { createdAt: 'desc' } } : {}),
      });
    },
  );

  it('returns zero progress for a purchase without receipts', async () => {
    const purchase = createPurchase('no-receipts', [
      { id: 'item-1', productId: 'product-1', quantity: 5 },
      { id: 'item-2', productId: 'product-2', quantity: 2 },
    ]);
    prismaMock.purchase.findMany.mockResolvedValue([purchase]);
    prismaMock.purchaseReceiptItem.findMany.mockResolvedValue([]);

    const result = await service.findAll('company-1');

    expect(result[0].receiptProgress).toEqual({
      orderedUnits: 7,
      receivedUnits: 0,
      pendingUnits: 7,
      orderedLines: 2,
      completedLines: 0,
    });
  });

  it('returns zero progress without querying receipt items for an empty purchase', async () => {
    prismaMock.purchase.findMany.mockResolvedValue([
      createPurchase('empty', []),
    ]);

    const result = await service.findAll('company-1');

    expect(result[0].receiptProgress).toEqual({
      orderedUnits: 0,
      receivedUnits: 0,
      pendingUnits: 0,
      orderedLines: 0,
      completedLines: 0,
    });
    expect(prismaMock.purchaseReceiptItem.findMany).not.toHaveBeenCalled();
  });

  it('aggregates multiple receipts by purchaseItemId across multiple lines', async () => {
    const firstPurchase = createPurchase('first', [
      { id: 'item-a', productId: 'product-1', quantity: 10 },
      { id: 'item-b', productId: 'product-1', quantity: 5 },
      { id: 'item-c', productId: 'product-2', quantity: 2 },
    ]);
    const secondPurchase = createPurchase('second', [
      { id: 'item-d', productId: 'product-3', quantity: 4 },
    ]);
    prismaMock.purchase.findMany.mockResolvedValue([
      firstPurchase,
      secondPurchase,
    ]);
    prismaMock.purchaseReceiptItem.findMany.mockResolvedValue([
      { purchaseItemId: 'item-a', quantityReceived: 3 },
      { purchaseItemId: 'item-a', quantityReceived: 2 },
      { purchaseItemId: 'item-b', quantityReceived: 5 },
      { purchaseItemId: 'item-c', quantityReceived: 1 },
    ]);

    const result = await service.findAll('company-1');

    expect(result.map((purchase) => purchase.id)).toEqual(['first', 'second']);
    expect(result[0].receiptProgress).toEqual({
      orderedUnits: 17,
      receivedUnits: 11,
      pendingUnits: 6,
      orderedLines: 3,
      completedLines: 1,
    });
    expect(result[1].receiptProgress).toEqual({
      orderedUnits: 4,
      receivedUnits: 0,
      pendingUnits: 4,
      orderedLines: 1,
      completedLines: 0,
    });
    expect(prismaMock.purchaseReceiptItem.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.purchaseReceiptItem.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        purchaseItemId: {
          in: ['item-a', 'item-b', 'item-c', 'item-d'],
        },
      },
      select: {
        purchaseItemId: true,
        quantityReceived: true,
      },
    });
  });

  it('reports fully received lines and never emits negative quantities', async () => {
    const purchase = createPurchase(
      'complete',
      [
        { id: 'item-complete', productId: 'product-1', quantity: 3 },
        { id: 'item-empty', productId: 'product-2', quantity: 0 },
      ],
      'RECEIVED',
    );
    prismaMock.purchase.findMany.mockResolvedValue([purchase]);
    prismaMock.purchaseReceiptItem.findMany.mockResolvedValue([
      { purchaseItemId: 'item-complete', quantityReceived: 3 },
      { purchaseItemId: 'item-empty', quantityReceived: -2 },
    ]);

    const result = await service.findAll('company-1');

    expect(result[0].status).toBe('RECEIVED');
    expect(result[0].receiptProgress).toEqual({
      orderedUnits: 3,
      receivedUnits: 3,
      pendingUnits: 0,
      orderedLines: 2,
      completedLines: 2,
    });
    expect(
      Object.values(result[0].receiptProgress).every((value) => value >= 0),
    ).toBe(true);
  });

  it('scopes receipt aggregation to the requesting company', async () => {
    const purchase = createPurchase('tenant-a', [
      { id: 'item-tenant-a', productId: 'product-1', quantity: 5 },
    ]);
    prismaMock.purchase.findMany.mockResolvedValue([purchase]);
    prismaMock.purchaseReceiptItem.findMany.mockImplementation(
      (args: {
        where: {
          companyId: string;
          purchaseItemId: { in: string[] };
        };
      }) => {
        expect(args.where.companyId).toBe('company-a');

        return args.where.companyId === 'company-a'
          ? [
              {
                purchaseItemId: 'item-tenant-a',
                quantityReceived: 2,
              },
            ]
          : [
              {
                purchaseItemId: 'item-tenant-a',
                quantityReceived: 99,
              },
            ];
      },
    );

    const result = await service.findAll('company-a');

    expect(result[0].receiptProgress.receivedUnits).toBe(2);
    expect(prismaMock.purchaseReceiptItem.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns one purchase with supplier, items, products and receipt progress', async () => {
    const purchase = createPurchase('detail', [
      { id: 'item-1', productId: 'product-1', quantity: 8 },
    ]);
    prismaMock.purchase.findFirst.mockResolvedValue(purchase);
    prismaMock.purchaseReceiptItem.findMany.mockResolvedValue([
      { purchaseItemId: 'item-1', quantityReceived: 3 },
    ]);

    const result = await service.findOne('company-1', 'detail');

    expect(result).toMatchObject({
      id: 'detail',
      supplier: {
        id: 'supplier-detail',
        name: 'Proveedor de prueba',
      },
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          product: {
            id: 'product-1',
            sku: 'SKU-product-1',
            name: 'Producto product-1',
          },
        },
      ],
      receiptProgress: {
        orderedUnits: 8,
        receivedUnits: 3,
        pendingUnits: 5,
        orderedLines: 1,
        completedLines: 0,
      },
    });
    expect(prismaMock.purchase.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'detail',
        companyId: 'company-1',
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  });

  it('returns zero detail progress without querying receipts when the purchase has no items', async () => {
    prismaMock.purchase.findFirst.mockResolvedValue(
      createPurchase('empty', []),
    );

    const result = await service.findOne('company-1', 'empty');

    expect(result.receiptProgress).toEqual({
      orderedUnits: 0,
      receivedUnits: 0,
      pendingUnits: 0,
      orderedLines: 0,
      completedLines: 0,
    });
    expect(prismaMock.purchaseReceiptItem.findMany).not.toHaveBeenCalled();
  });

  it('returns pending detail progress for a purchase without receipts', async () => {
    prismaMock.purchase.findFirst.mockResolvedValue(
      createPurchase('no-receipts', [
        { id: 'item-1', productId: 'product-1', quantity: 5 },
      ]),
    );
    prismaMock.purchaseReceiptItem.findMany.mockResolvedValue([]);

    const result = await service.findOne('company-1', 'no-receipts');

    expect(result.receiptProgress).toEqual({
      orderedUnits: 5,
      receivedUnits: 0,
      pendingUnits: 5,
      orderedLines: 1,
      completedLines: 0,
    });
  });

  it('aggregates partial and multiple receipts for the same detail item', async () => {
    prismaMock.purchase.findFirst.mockResolvedValue(
      createPurchase('partial', [
        { id: 'item-1', productId: 'product-1', quantity: 10 },
      ]),
    );
    prismaMock.purchaseReceiptItem.findMany.mockResolvedValue([
      { purchaseItemId: 'item-1', quantityReceived: 2 },
      { purchaseItemId: 'item-1', quantityReceived: 3 },
    ]);

    const result = await service.findOne('company-1', 'partial');

    expect(result.receiptProgress).toEqual({
      orderedUnits: 10,
      receivedUnits: 5,
      pendingUnits: 5,
      orderedLines: 1,
      completedLines: 0,
    });
  });

  it('aggregates multiple detail items independently when they share the same product', async () => {
    prismaMock.purchase.findFirst.mockResolvedValue(
      createPurchase('duplicate-product-lines', [
        { id: 'item-a', productId: 'product-1', quantity: 6 },
        { id: 'item-b', productId: 'product-1', quantity: 4 },
      ]),
    );
    prismaMock.purchaseReceiptItem.findMany.mockResolvedValue([
      { purchaseItemId: 'item-a', quantityReceived: 6 },
      { purchaseItemId: 'item-b', quantityReceived: 1 },
    ]);

    const result = await service.findOne(
      'company-1',
      'duplicate-product-lines',
    );

    expect(result.receiptProgress).toEqual({
      orderedUnits: 10,
      receivedUnits: 7,
      pendingUnits: 3,
      orderedLines: 2,
      completedLines: 1,
    });
    expect(prismaMock.purchaseReceiptItem.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        purchaseItemId: {
          in: ['item-a', 'item-b'],
        },
      },
      select: {
        purchaseItemId: true,
        quantityReceived: true,
      },
    });
  });

  it('reports complete detail progress and clamps pending quantities to zero', async () => {
    prismaMock.purchase.findFirst.mockResolvedValue(
      createPurchase('complete', [
        { id: 'item-1', productId: 'product-1', quantity: 3 },
      ]),
    );
    prismaMock.purchaseReceiptItem.findMany.mockResolvedValue([
      { purchaseItemId: 'item-1', quantityReceived: 5 },
    ]);

    const result = await service.findOne('company-1', 'complete');

    expect(result.receiptProgress).toEqual({
      orderedUnits: 3,
      receivedUnits: 5,
      pendingUnits: 0,
      orderedLines: 1,
      completedLines: 1,
    });
  });

  it('throws not found for missing or foreign-company purchases', async () => {
    prismaMock.purchase.findFirst.mockResolvedValue(null);

    await expect(service.findOne('company-1', 'foreign')).rejects.toThrow(
      'Compra no encontrada',
    );
    expect(prismaMock.purchase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'foreign',
          companyId: 'company-1',
        },
      }),
    );
    expect(prismaMock.purchaseReceiptItem.findMany).not.toHaveBeenCalled();
  });

  it('scopes detail receipt aggregation to companyId and avoids N+1 per item', async () => {
    prismaMock.purchase.findFirst.mockResolvedValue(
      createPurchase('tenant-safe', [
        { id: 'item-a', productId: 'product-1', quantity: 2 },
        { id: 'item-b', productId: 'product-2', quantity: 3 },
        { id: 'item-c', productId: 'product-3', quantity: 4 },
      ]),
    );
    prismaMock.purchaseReceiptItem.findMany.mockImplementation(
      (args: {
        where: {
          companyId: string;
          purchaseItemId: { in: string[] };
        };
      }) => {
        expect(args.where.companyId).toBe('company-a');

        return [
          { purchaseItemId: 'item-a', quantityReceived: 1 },
          { purchaseItemId: 'item-c', quantityReceived: 4 },
        ];
      },
    );

    const result = await service.findOne('company-a', 'tenant-safe');

    expect(result.receiptProgress).toEqual({
      orderedUnits: 9,
      receivedUnits: 5,
      pendingUnits: 4,
      orderedLines: 3,
      completedLines: 1,
    });
    expect(prismaMock.purchaseReceiptItem.findMany).toHaveBeenCalledTimes(1);
  });
});
