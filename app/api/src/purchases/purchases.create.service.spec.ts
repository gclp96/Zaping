import { PurchasesService } from './purchases.service';
import { PurchasesFolioService } from './purchases-folio.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guards';
import { PurchasesController } from './purchases.controller';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';

describe('PurchasesService — annual folio creation', () => {
  const folios = { allocateNextAvailableFolio: jest.fn() };
  const tx = {
    supplier: { findFirst: jest.fn() },
    product: { findMany: jest.fn() },
    purchase: { create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn() };
  const service = new PurchasesService(
    prisma as unknown as PrismaService,
    folios as unknown as PurchasesFolioService,
  );
  const dto = {
    supplierId: 'supplier-a',
    items: [{ productId: 'product-a', quantity: 2 }],
  };
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );
    tx.supplier.findFirst.mockResolvedValue({ id: 'supplier-a' });
    tx.product.findMany.mockResolvedValue([{ id: 'product-a', cost: 100 }]);
    folios.allocateNextAvailableFolio.mockResolvedValue('OC-26-00001');
    tx.purchase.create.mockResolvedValue({
      id: 'purchase-a',
      folio: 'OC-26-00001',
      status: 'DRAFT',
    });
  });
  it('allocates and creates purchase and items through the same transaction', async () => {
    await expect(service.create('company-a', dto)).resolves.toMatchObject({
      folio: 'OC-26-00001',
      status: 'DRAFT',
    });
    expect(folios.allocateNextAvailableFolio).toHaveBeenCalledWith(
      tx,
      'company-a',
    );
    expect(tx.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: 'supplier-a', companyId: 'company-a' },
    });
    expect(tx.product.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-a', id: { in: ['product-a'] } },
    });
    expect(tx.purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          companyId: 'company-a',
          supplierId: 'supplier-a',
          folio: 'OC-26-00001',
          subtotal: 200,
          iva: 32,
          total: 232,
          items: {
            create: [
              {
                productId: 'product-a',
                quantity: 2,
                price: 100,
                subtotal: 200,
              },
            ],
          },
        },
      }),
    );
  });
  it('records the authenticated author at creation, not an editable buyer field', async () => {
    await service.create('company-a', dto, UserRole.ADMIN, false, {
      id: 'user-1',
      firstName: 'Ana',
      lastName: 'Compras',
    });

    const [args] = tx.purchase.create.mock.calls[0] as [
      {
        data: {
          createdByUserId?: string;
          createdByDisplayName?: string;
          buyerName?: string;
        };
      },
    ];
    expect(args.data.createdByUserId).toBe('user-1');
    expect(args.data.createdByDisplayName).toBe('Ana Compras');
    expect(args.data.buyerName).toBeUndefined();
  });

  it('persists a negotiated line cost without mutating the product catalog', async () => {
    await service.create(
      'company-a',
      {
        ...dto,
        items: [{ productId: 'product-a', quantity: 2, unitCost: 11.2345 }],
      },
      UserRole.ADMIN,
    );

    expect(tx.purchase.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-a',
        supplierId: 'supplier-a',
        folio: 'OC-26-00001',
        subtotal: 22.47,
        iva: 3.6,
        total: 26.07,
        items: {
          create: [
            {
              productId: 'product-a',
              quantity: 2,
              price: 11.2345,
              subtotal: 22.47,
            },
          ],
        },
      },
      include: {
        supplier: true,
        items: { include: { product: true } },
      },
    });
    expect(tx.product.findMany).toHaveBeenCalledTimes(1);
  });

  it('guarda descuento real usando precio unitario neto para Recepciones', async () => {
    await service.create(
      'company-a',
      {
        ...dto,
        items: [
          {
            productId: 'product-a',
            quantity: 10,
            unitCost: 85.5,
            discountPercent: 10,
          },
        ],
      },
      UserRole.ADMIN,
    );
    const [createArgs] = tx.purchase.create.mock.calls[0] as [
      {
        data: {
          subtotal: number;
          iva: number;
          total: number;
          items: { create: unknown[] };
        };
      },
    ];
    expect(createArgs.data.subtotal).toBe(769.5);
    expect(createArgs.data.iva).toBe(123.12);
    expect(createArgs.data.total).toBe(892.62);
    expect(createArgs.data.items.create).toEqual([
      {
        productId: 'product-a',
        quantity: 10,
        listUnitCost: 85.5,
        discountPercent: 10,
        price: 76.95,
        subtotal: 769.5,
      },
    ]);
  });

  it('prohíbe descuentos explícitos a WAREHOUSE no delegado', async () => {
    await expect(
      service.create(
        'company-a',
        {
          ...dto,
          items: [{ productId: 'product-a', quantity: 2, discountPercent: 10 }],
        },
        UserRole.WAREHOUSE,
      ),
    ).rejects.toThrow('No tienes permiso para modificar descuentos de compra');
    expect(tx.purchase.create).not.toHaveBeenCalled();
  });

  it('permite el descuento a comprador WAREHOUSE delegado', async () => {
    await service.create(
      'company-a',
      {
        ...dto,
        items: [{ productId: 'product-a', quantity: 2, discountPercent: 5 }],
      },
      UserRole.WAREHOUSE,
      true,
    );
    const [createArgs] = tx.purchase.create.mock.calls[0] as [
      {
        data: {
          subtotal: number;
          items: { create: unknown[] };
        };
      },
    ];
    expect(createArgs.data.subtotal).toBe(190);
    expect(createArgs.data.items.create).toEqual([
      {
        productId: 'product-a',
        quantity: 2,
        listUnitCost: 100,
        discountPercent: 5,
        price: 95,
        subtotal: 190,
      },
    ]);
  });

  it('rejects unauthorized or malformed cost changes before allocation', async () => {
    for (const [unitCost, role] of [
      [11, UserRole.WAREHOUSE],
      [-1, UserRole.ADMIN],
      [1.23456, UserRole.MANAGER],
    ] as const) {
      await expect(
        service.create(
          'company-a',
          {
            ...dto,
            items: [{ productId: 'product-a', quantity: 2, unitCost }],
          },
          role,
        ),
      ).rejects.toThrow();
    }
    expect(folios.allocateNextAvailableFolio).not.toHaveBeenCalled();
    expect(tx.purchase.create).not.toHaveBeenCalled();
  });

  it.each(['supplier', 'product', 'duplicate'])(
    'rejects invalid %s without allocating',
    async (invalid) => {
      if (invalid === 'supplier') tx.supplier.findFirst.mockResolvedValue(null);
      if (invalid === 'product') tx.product.findMany.mockResolvedValue([]);
      const request =
        invalid === 'duplicate'
          ? { ...dto, items: [...dto.items, ...dto.items] }
          : dto;
      await expect(service.create('company-a', request)).rejects.toThrow();
      expect(folios.allocateNextAvailableFolio).not.toHaveBeenCalled();
      expect(tx.purchase.create).not.toHaveBeenCalled();
    },
  );
  it('propagates a failed insert to the transaction without issuing a second allocation', async () => {
    const error = Object.assign(new Error('unique conflict'), {
      code: 'P2002',
    });
    tx.purchase.create.mockRejectedValue(error);
    await expect(service.create('company-a', dto)).rejects.toBe(error);
    expect(folios.allocateNextAvailableFolio).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('Purchase creation authorization contract', () => {
  it.each([
    [UserRole.ADMIN, true],
    [UserRole.MANAGER, true],
    [UserRole.WAREHOUSE, true],
    [UserRole.SALES, false],
  ])('preserves create permission for %s', (role, expected) => {
    const context = {
      getHandler: (): unknown =>
        Object.getOwnPropertyDescriptor(PurchasesController.prototype, 'create')
          ?.value,
      getClass: () => PurchasesController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role, companyId: 'company-a' } }),
      }),
    } as unknown as ExecutionContext;
    expect(new RolesGuard(new Reflector()).canActivate(context)).toBe(expected);
  });

  it('takes Company from authentication rather than additional request fields', () => {
    const create = jest.fn();
    const controller = new PurchasesController({
      create,
    } as unknown as PurchasesService);
    const dto = {
      supplierId: 'supplier-a',
      items: [{ productId: 'product-a', quantity: 1 }],
      companyId: 'company-foreign',
    };
    void controller.create(
      { user: { companyId: 'company-a' } } as AuthenticatedRequest,
      dto,
    );
    expect(create).toHaveBeenCalledWith('company-a', dto, undefined, false, {
      companyId: 'company-a',
    });
  });
});
