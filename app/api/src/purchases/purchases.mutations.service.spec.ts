import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchaseStatus, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { PurchasesService } from './purchases.service';
import { PurchasesFolioService } from './purchases-folio.service';

describe('PurchasesService — tenant-safe mutations', () => {
  const companyId = '11111111-1111-4111-8111-111111111111';
  const otherCompanyId = '99999999-9999-4999-8999-999999999999';
  const purchaseId = '22222222-2222-4222-8222-222222222222';
  const supplierId = '33333333-3333-4333-8333-333333333333';
  const productId = '44444444-4444-4444-8444-444444444444';

  let service: PurchasesService;
  let prisma: {
    $transaction: jest.Mock;
  };
  let transactionClient: {
    purchase: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    supplier: {
      findFirst: jest.Mock;
    };
    product: {
      findMany: jest.Mock;
    };
    purchaseItem: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
  };

  beforeEach(() => {
    transactionClient = {
      purchase: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      supplier: {
        findFirst: jest.fn().mockResolvedValue({ id: supplierId }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: productId,
            cost: 100,
          },
        ]),
      },
      purchaseItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    prisma = {
      $transaction: jest.fn(
        (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      ),
    };

    service = new PurchasesService(
      prisma as unknown as PrismaService,
      {} as PurchasesFolioService,
    );
  });

  const updateDto: UpdatePurchaseDto = {
    supplierId,
    items: [
      {
        productId,
        quantity: 2,
      },
    ],
  };

  it('actualiza la compra y sus partidas usando la empresa en la mutación final', async () => {
    const updatedPurchase = {
      id: purchaseId,
      companyId,
      supplierId,
      status: PurchaseStatus.DRAFT,
      items: [],
    };

    transactionClient.purchase.findFirst
      .mockResolvedValueOnce({
        id: purchaseId,
        status: PurchaseStatus.DRAFT,
      })
      .mockResolvedValueOnce(updatedPurchase);

    await expect(
      service.update(companyId, purchaseId, updateDto),
    ).resolves.toEqual(updatedPurchase);

    expect(transactionClient.purchase.updateMany).toHaveBeenCalledWith({
      where: {
        id: purchaseId,
        companyId,
        status: PurchaseStatus.DRAFT,
      },
      data: {
        supplierId,
        subtotal: 200,
        iva: 32,
        total: 232,
      },
    });
    expect(transactionClient.purchaseItem.deleteMany).toHaveBeenCalledWith({
      where: {
        purchaseId,
        purchase: {
          companyId,
        },
      },
    });
    expect(transactionClient.purchaseItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          purchaseId,
          productId,
          quantity: 2,
          price: 100,
          subtotal: 200,
        },
      ],
    });
    expect(transactionClient.purchase.findFirst).toHaveBeenLastCalledWith({
      where: {
        id: purchaseId,
        companyId,
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

  it('preserva el costo pactado de una partida al editar únicamente la cantidad', async () => {
    transactionClient.purchase.findFirst
      .mockResolvedValueOnce({
        id: purchaseId,
        status: PurchaseStatus.DRAFT,
        items: [{ productId, price: 72.125 }],
      })
      .mockResolvedValueOnce({ id: purchaseId, status: PurchaseStatus.DRAFT });
    await service.update(companyId, purchaseId, updateDto, UserRole.WAREHOUSE);
    expect(transactionClient.purchase.updateMany).toHaveBeenCalledWith({
      where: { id: purchaseId, companyId, status: PurchaseStatus.DRAFT },
      data: { supplierId, subtotal: 144.25, iva: 23.08, total: 167.33 },
    });
    expect(transactionClient.purchaseItem.createMany).toHaveBeenCalledWith({
      data: [{ purchaseId, productId, quantity: 2, price: 72.125, subtotal: 144.25 }],
    });
  });

  it('permite cambiar el costo del borrador con rol autorizado', async () => {
    transactionClient.purchase.findFirst
      .mockResolvedValueOnce({
        id: purchaseId, status: PurchaseStatus.DRAFT,
        items: [{ productId, price: 100 }],
      })
      .mockResolvedValueOnce({ id: purchaseId, status: PurchaseStatus.DRAFT });
    await service.update(companyId, purchaseId, {
      ...updateDto, items: [{ productId, quantity: 2, unitCost: 12.3456 }],
    }, UserRole.MANAGER);
    expect(transactionClient.purchaseItem.createMany).toHaveBeenCalledWith({
      data: [{ purchaseId, productId, quantity: 2, price: 12.3456, subtotal: 24.69 }],
    });
  });

  it('permite al responsable de Compras delegado ajustar costos sin concederle aprobación', async () => {
    transactionClient.purchase.findFirst
      .mockResolvedValueOnce({
        id: purchaseId,
        status: PurchaseStatus.DRAFT,
        items: [{ productId, price: 100 }],
      })
      .mockResolvedValueOnce({ id: purchaseId, status: PurchaseStatus.DRAFT });
    await service.update(companyId, purchaseId, {
      ...updateDto, items: [{ productId, quantity: 2, unitCost: 43.125 }],
    }, UserRole.WAREHOUSE, true);
    expect(transactionClient.purchaseItem.createMany).toHaveBeenCalledWith({
      data: [{ purchaseId, productId, quantity: 2, price: 43.125, subtotal: 86.25 }],
    });
  });

  it('rechaza modificaciones de costo de un usuario de almacén sin mutación final', async () => {
    transactionClient.purchase.findFirst.mockResolvedValue({
      id: purchaseId, status: PurchaseStatus.DRAFT,
      items: [{ productId, price: 100 }],
    });
    await expect(service.update(companyId, purchaseId, {
      ...updateDto, items: [{ productId, quantity: 2, unitCost: 50 }],
    }, UserRole.WAREHOUSE)).rejects.toThrow();
    expect(transactionClient.purchase.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.purchaseItem.createMany).not.toHaveBeenCalled();
  });

  it('rechaza un proveedor de otro tenant antes de mutar compra o partidas', async () => {
    transactionClient.purchase.findFirst.mockResolvedValue({
      id: purchaseId,
      status: PurchaseStatus.DRAFT,
    });
    transactionClient.supplier.findFirst.mockResolvedValue(null);

    await expect(
      service.update(companyId, purchaseId, {
        ...updateDto,
        supplierId: otherCompanyId,
      }),
    ).rejects.toThrow(new NotFoundException('Proveedor no encontrado'));

    expect(transactionClient.purchase.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.purchaseItem.deleteMany).not.toHaveBeenCalled();
    expect(transactionClient.purchaseItem.createMany).not.toHaveBeenCalled();
    expect(transactionClient.supplier.findFirst).toHaveBeenCalledWith({
      where: {
        id: otherCompanyId,
        companyId,
      },
      select: {
        id: true,
      },
    });
  });

  it('rechaza una compra de otro tenant antes de validar relaciones o mutar partidas', async () => {
    transactionClient.purchase.findFirst.mockResolvedValue(null);

    await expect(
      service.update(otherCompanyId, purchaseId, updateDto),
    ).rejects.toThrow(new NotFoundException('Compra no encontrada'));

    expect(transactionClient.supplier.findFirst).not.toHaveBeenCalled();
    expect(transactionClient.product.findMany).not.toHaveBeenCalled();
    expect(transactionClient.purchase.updateMany).not.toHaveBeenCalled();
    expect(transactionClient.purchaseItem.deleteMany).not.toHaveBeenCalled();
    expect(transactionClient.purchaseItem.createMany).not.toHaveBeenCalled();
  });

  it('rechaza una mutación final que perdió la compra sin tocar sus partidas', async () => {
    transactionClient.purchase.findFirst
      .mockResolvedValueOnce({
        id: purchaseId,
        status: PurchaseStatus.DRAFT,
      })
      .mockResolvedValueOnce({
        id: purchaseId,
        status: PurchaseStatus.CONFIRMED,
      });
    transactionClient.purchase.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(companyId, purchaseId, updateDto),
    ).rejects.toThrow(
      new BadRequestException(
        `No se puede editar una compra con estado ${PurchaseStatus.CONFIRMED}`,
      ),
    );

    expect(transactionClient.purchaseItem.deleteMany).not.toHaveBeenCalled();
    expect(transactionClient.purchaseItem.createMany).not.toHaveBeenCalled();
  });
});
