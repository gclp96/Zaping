import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { UserRole } from '@prisma/client';

import { Response } from 'express';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { PurchasesFolioService } from './purchases-folio.service';
import { renderPurchaseOrderPdf } from './purchase-order-pdf';
import {
  buildPurchaseCommercialSnapshot,
  parsePurchaseCalendarDate,
} from './purchase-commercial';

type PurchaseWithReceiptItems = {
  items: Array<{
    id: string;
    quantity: number;
  }>;
};

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly folios: PurchasesFolioService,
  ) {}

  async create(
    companyId: string,
    dto: CreatePurchaseDto,
    actorRole?: UserRole,
    actorCanAdjustPurchaseUnitCost = false,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const productIds = dto.items.map((item) => item.productId);
      const uniqueProductIds = new Set(productIds);

      if (uniqueProductIds.size !== productIds.length) {
        throw new BadRequestException(
          'No se permiten productos duplicados en una compra',
        );
      }

      const supplier = await tx.supplier.findFirst({
        where: {
          id: dto.supplierId,
          companyId,
        },
      });

      if (!supplier) {
        throw new NotFoundException('Proveedor no encontrado');
      }

      const products = await tx.product.findMany({
        where: {
          companyId,
          id: {
            in: productIds,
          },
        },
      });

      const productsById = new Map(
        products.map((product) => [product.id, product]),
      );

      const missingProductId = productIds.find(
        (productId) => !productsById.has(productId),
      );

      if (missingProductId) {
        throw new NotFoundException(
          `Producto ${missingProductId} no encontrado`,
        );
      }

      const purchaseItems: Array<{
        productId: string;
        quantity: number;
        price: number;
        listUnitCost?: number;
        discountPercent?: number;
        subtotal: number;
      }> = [];

      let subtotal = 0;

      for (const item of dto.items) {
        const product = productsById.get(item.productId);

        if (!product) {
          throw new NotFoundException(
            `Producto ${item.productId} no encontrado`,
          );
        }

        const baseCost = this.resolvePurchaseItemUnitCost(
          item.unitCost,
          product.cost,
          actorRole,
          actorCanAdjustPurchaseUnitCost,
        );
        const discount = this.resolvePurchaseItemDiscount(
          item.discountPercent,
          0,
          actorRole,
          actorCanAdjustPurchaseUnitCost,
        );
        // Inventory receipts use PurchaseItem.price, so it stores the
        // effective (discounted) unit cost, never the list price.
        const unitCost = this.roundUnitCost(baseCost * (1 - discount / 100));
        const itemSubtotal = this.roundMoney(item.quantity * unitCost);

        subtotal = this.roundMoney(subtotal + itemSubtotal);

        purchaseItems.push({
          productId: product.id,
          quantity: item.quantity,
          price: unitCost,
          ...(discount > 0 && {
            listUnitCost: baseCost,
            discountPercent: discount,
          }),
          subtotal: itemSubtotal,
        });
      }

      const iva = this.roundMoney(subtotal * 0.16);
      const total = this.roundMoney(subtotal + iva);
      const folio = await this.folios.allocateNextAvailableFolio(tx, companyId);

      return tx.purchase.create({
        data: {
          companyId,
          supplierId: dto.supplierId,
          folio,
          subtotal,
          iva,
          total,
          ...(dto.paymentTerms !== undefined && {
            paymentTerms: dto.paymentTerms,
          }),
          ...(dto.paymentMethod !== undefined && {
            paymentMethod: dto.paymentMethod,
          }),
          ...(dto.paymentDueDate !== undefined && {
            paymentDueDate: parsePurchaseCalendarDate(dto.paymentDueDate),
          }),
          ...(dto.expectedDeliveryDate !== undefined && {
            expectedDeliveryDate: parsePurchaseCalendarDate(
              dto.expectedDeliveryDate,
            ),
          }),
          ...(dto.buyerName !== undefined && {
            buyerName: dto.buyerName,
          }),
          items: {
            create: purchaseItems,
          },
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
  }

  async findAll(companyId: string) {
    const purchases = await this.prisma.purchase.findMany({
      where: {
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    const receivedByPurchaseItem =
      await this.getReceivedQuantitiesByPurchaseItem(companyId, purchases);

    return purchases.map((purchase) =>
      this.withReceiptProgress(purchase, receivedByPurchaseItem),
    );
  }

  async findOne(companyId: string, purchaseId: string) {
    const purchase = await this.prisma.purchase.findFirst({
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

    if (!purchase) {
      throw new NotFoundException('Compra no encontrada');
    }

    const receivedByPurchaseItem =
      await this.getReceivedQuantitiesByPurchaseItem(companyId, [purchase]);

    return this.withReceiptProgress(purchase, receivedByPurchaseItem);
  }

  private async getReceivedQuantitiesByPurchaseItem(
    companyId: string,
    purchases: PurchaseWithReceiptItems[],
  ) {
    const purchaseItemIds = purchases.flatMap((purchase) =>
      purchase.items.map((item) => item.id),
    );

    if (purchaseItemIds.length === 0) {
      return new Map<string, number>();
    }

    const receiptItems = await this.prisma.purchaseReceiptItem.findMany({
      where: {
        companyId,
        purchaseItemId: {
          in: purchaseItemIds,
        },
      },
      select: {
        purchaseItemId: true,
        quantityReceived: true,
      },
    });

    const receivedByPurchaseItem = new Map<string, number>();

    for (const receiptItem of receiptItems) {
      const previousQuantity =
        receivedByPurchaseItem.get(receiptItem.purchaseItemId) ?? 0;

      receivedByPurchaseItem.set(
        receiptItem.purchaseItemId,
        previousQuantity + Math.max(receiptItem.quantityReceived, 0),
      );
    }

    return receivedByPurchaseItem;
  }

  private withReceiptProgress<TPurchase extends PurchaseWithReceiptItems>(
    purchase: TPurchase,
    receivedByPurchaseItem: Map<string, number>,
  ) {
    let orderedUnits = 0;
    let receivedUnits = 0;
    let pendingUnits = 0;
    let completedLines = 0;

    for (const item of purchase.items) {
      const orderedQuantity = Math.max(item.quantity, 0);
      const receivedQuantity = Math.max(
        receivedByPurchaseItem.get(item.id) ?? 0,
        0,
      );
      const pendingQuantity = Math.max(orderedQuantity - receivedQuantity, 0);

      orderedUnits += orderedQuantity;
      receivedUnits += receivedQuantity;
      pendingUnits += pendingQuantity;

      if (receivedQuantity >= orderedQuantity) {
        completedLines += 1;
      }
    }

    return {
      ...purchase,
      receiptProgress: {
        orderedUnits,
        receivedUnits,
        pendingUnits,
        orderedLines: purchase.items.length,
        completedLines,
      },
    };
  }

  async update(
    companyId: string,
    purchaseId: string,
    dto: UpdatePurchaseDto,
    actorRole?: UserRole,
    actorCanAdjustPurchaseUnitCost = false,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: {
          id: purchaseId,
          companyId,
        },
        select: {
          id: true,
          status: true,
          items: {
            select: {
              productId: true,
              price: true,
              listUnitCost: true,
              discountPercent: true,
            },
          },
        },
      });

      if (!purchase) {
        throw new NotFoundException('Compra no encontrada');
      }

      if (purchase.status !== 'DRAFT') {
        throw new BadRequestException(
          `No se puede editar una compra con estado ${purchase.status}`,
        );
      }

      const productIds = dto.items.map((item) => item.productId);

      const uniqueProductIds = new Set(productIds);

      if (uniqueProductIds.size !== productIds.length) {
        throw new BadRequestException(
          'No se permiten productos duplicados en una compra',
        );
      }

      const supplier = await tx.supplier.findFirst({
        where: {
          id: dto.supplierId,
          companyId,
        },
        select: {
          id: true,
        },
      });

      if (!supplier) {
        throw new NotFoundException('Proveedor no encontrado');
      }

      const products = await tx.product.findMany({
        where: {
          companyId,
          id: {
            in: productIds,
          },
        },
      });

      const productsById = new Map(
        products.map((product) => [product.id, product]),
      );

      const missingProductId = productIds.find(
        (productId) => !productsById.has(productId),
      );

      if (missingProductId) {
        throw new NotFoundException(
          `Producto ${missingProductId} no encontrado`,
        );
      }

      const purchaseItems: Array<{
        productId: string;
        quantity: number;
        price: number;
        listUnitCost?: number;
        discountPercent?: number;
        subtotal: number;
      }> = [];

      let subtotal = 0;

      for (const item of dto.items) {
        const product = productsById.get(item.productId);

        if (!product) {
          throw new NotFoundException(
            `Producto ${item.productId} no encontrado`,
          );
        }

        const previous = purchase.items?.find(
          (line) => line.productId === product.id,
        );
        const baseCost = this.resolvePurchaseItemUnitCost(
          item.unitCost,
          previous?.listUnitCost ?? previous?.price ?? product.cost,
          actorRole,
          actorCanAdjustPurchaseUnitCost,
        );
        const discount = this.resolvePurchaseItemDiscount(
          item.discountPercent,
          previous?.discountPercent ?? 0,
          actorRole,
          actorCanAdjustPurchaseUnitCost,
        );
        const unitCost = this.roundUnitCost(baseCost * (1 - discount / 100));
        const itemSubtotal = this.roundMoney(item.quantity * unitCost);

        subtotal = this.roundMoney(subtotal + itemSubtotal);

        purchaseItems.push({
          productId: product.id,
          quantity: item.quantity,
          price: unitCost,
          ...(discount > 0 && {
            listUnitCost: baseCost,
            discountPercent: discount,
          }),
          subtotal: itemSubtotal,
        });
      }

      const iva = this.roundMoney(subtotal * 0.16);
      const total = this.roundMoney(subtotal + iva);

      const updateResult = await tx.purchase.updateMany({
        where: {
          id: purchaseId,
          companyId,
          status: 'DRAFT',
        },
        data: {
          supplierId: dto.supplierId,
          subtotal,
          iva,
          total,
          ...(dto.paymentTerms !== undefined && {
            paymentTerms: dto.paymentTerms,
          }),
          ...(dto.paymentMethod !== undefined && {
            paymentMethod: dto.paymentMethod,
          }),
          ...(dto.paymentDueDate !== undefined && {
            paymentDueDate: parsePurchaseCalendarDate(dto.paymentDueDate),
          }),
          ...(dto.expectedDeliveryDate !== undefined && {
            expectedDeliveryDate: parsePurchaseCalendarDate(
              dto.expectedDeliveryDate,
            ),
          }),
          ...(dto.buyerName !== undefined && {
            buyerName: dto.buyerName,
          }),
        },
      });

      if (updateResult.count === 0) {
        const currentPurchase = await tx.purchase.findFirst({
          where: {
            id: purchaseId,
            companyId,
          },
          select: {
            status: true,
          },
        });

        if (!currentPurchase) {
          throw new NotFoundException('Compra no encontrada');
        }

        throw new BadRequestException(
          `No se puede editar una compra con estado ${currentPurchase.status}`,
        );
      }

      await tx.purchaseItem.deleteMany({
        where: {
          purchaseId,
          purchase: {
            companyId,
          },
        },
      });

      await tx.purchaseItem.createMany({
        data: purchaseItems.map((item) => ({
          ...item,
          purchaseId,
        })),
      });

      return tx.purchase.findFirst({
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
  }

  async findInventoryMovements(companyId: string, purchaseId: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: {
        id: purchaseId,
        companyId,
      },
      select: {
        id: true,
        receipts: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException('Compra no encontrada');
    }

    const receiptIds = purchase.receipts.map((receipt) => receipt.id);

    if (receiptIds.length === 0) {
      return [];
    }

    return this.prisma.inventoryMovement.findMany({
      where: {
        companyId,
        referenceType: 'PURCHASE_RECEIPT',
        referenceId: {
          in: receiptIds,
        },
      },
      include: {
        product: true,
        batch: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async approve(companyId: string, purchaseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const statusTransition = await tx.purchase.updateMany({
        where: {
          id: purchaseId,
          companyId,
          status: 'DRAFT',
        },
        data: {
          status: 'CONFIRMED',
        },
      });

      if (statusTransition.count === 0) {
        const existingPurchase = await tx.purchase.findFirst({
          where: {
            id: purchaseId,
            companyId,
          },
          select: {
            status: true,
          },
        });

        if (!existingPurchase) {
          throw new NotFoundException('Compra no encontrada');
        }

        if (existingPurchase.status === 'CONFIRMED') {
          throw new ConflictException('La compra ya fue confirmada');
        }

        throw new BadRequestException(
          `No se puede confirmar una compra con estado ${existingPurchase.status}`,
        );
      }

      const purchase = await tx.purchase.findFirst({
        where: {
          id: purchaseId,
          companyId,
        },
        include: {
          company: true,
          supplier: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!purchase) {
        throw new NotFoundException('Compra no encontrada');
      }

      if (purchase.items.length === 0) {
        throw new BadRequestException(
          'No se puede confirmar una compra sin productos',
        );
      }

      // The snapshot and status transition are in the same DB transaction.
      // Later edits to Company, Supplier or Product cannot rewrite this PDF.
      const commercialSnapshot = buildPurchaseCommercialSnapshot(purchase);
      const frozen = await tx.purchase.updateMany({
        where: { id: purchaseId, companyId, status: 'CONFIRMED' },
        data: {
          commercialSnapshot,
        },
      });
      if (frozen.count !== 1) {
        throw new ConflictException('No fue posible congelar la compra');
      }

      return { ...purchase, commercialSnapshot };
    });
  }

  async cancel(companyId: string, purchaseId: string) {
    const statusTransition = await this.prisma.purchase.updateMany({
      where: {
        id: purchaseId,
        companyId,
        status: 'DRAFT',
      },
      data: {
        status: 'CANCELLED',
      },
    });

    if (statusTransition.count === 0) {
      const purchase = await this.prisma.purchase.findFirst({
        where: {
          id: purchaseId,
          companyId,
        },
        select: {
          status: true,
        },
      });

      if (!purchase) {
        throw new NotFoundException('Compra no encontrada');
      }

      if (purchase.status === 'CANCELLED') {
        throw new ConflictException('La compra ya fue cancelada');
      }

      if (purchase.status === 'CONFIRMED') {
        throw new BadRequestException(
          'Una compra confirmada no puede cancelarse',
        );
      }

      throw new BadRequestException(
        `No se puede cancelar una compra con estado ${purchase.status}`,
      );
    }

    return this.prisma.purchase.findFirst({
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
  }

  private roundUnitCost(value: number): number {
    return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
  }

  private resolvePurchaseItemDiscount(
    requested: number | undefined,
    fallback: number,
    role?: UserRole,
    delegated = false,
  ): number {
    if (requested === undefined) return fallback;

    if (
      role !== UserRole.ADMIN &&
      role !== UserRole.MANAGER &&
      !(role === UserRole.WAREHOUSE && delegated)
    ) {
      throw new ForbiddenException(
        'No tienes permiso para modificar descuentos de compra',
      );
    }

    const hundredths = requested * 100;
    if (
      !Number.isFinite(requested) ||
      requested < 0 ||
      requested > 100 ||
      !Number.isSafeInteger(Math.round(hundredths)) ||
      Math.abs(hundredths - Math.round(hundredths)) > 0.000001
    ) {
      throw new BadRequestException(
        'El descuento debe ser un porcentaje entre 0 y 100 con máximo 2 decimales',
      );
    }

    return requested;
  }

  private resolvePurchaseItemUnitCost(
    requestedCost: number | undefined,
    fallbackCost: number,
    actorRole?: UserRole,
    actorCanAdjustPurchaseUnitCost = false,
  ): number {
    if (requestedCost === undefined) {
      return fallbackCost;
    }

    const roleAllowsEdit =
      actorRole === UserRole.ADMIN || actorRole === UserRole.MANAGER;
    const delegatedBuyer =
      actorRole === UserRole.WAREHOUSE && actorCanAdjustPurchaseUnitCost;

    if (!roleAllowsEdit && !delegatedBuyer) {
      throw new ForbiddenException(
        'No tienes permiso para modificar el costo unitario de la compra',
      );
    }

    const inTenThousandths = requestedCost * 10_000;
    if (
      !Number.isFinite(requestedCost) ||
      requestedCost < 0 ||
      !Number.isSafeInteger(Math.round(inTenThousandths)) ||
      Math.abs(inTenThousandths - Math.round(inTenThousandths)) > 0.000001
    ) {
      throw new BadRequestException(
        'El costo unitario debe ser no negativo y tener como máximo 4 decimales',
      );
    }

    return requestedCost;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async generatePDF(companyId: string, purchaseId: string, res: Response) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, companyId },
      include: {
        company: true,
        supplier: true,
        items: {
          include: { product: true },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException('Compra no encontrada');
    }

    renderPurchaseOrderPdf(purchase, res);
  }
}
