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
    });
    expect(tx.product.findMany).toHaveBeenCalledTimes(1);
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
    expect(create).toHaveBeenCalledWith('company-a', dto, undefined, false);
  });
});
