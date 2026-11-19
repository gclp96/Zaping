import { inventoryWriterError } from '../inventory/physical/inventory-authority-error';
import { InventoryAuthorityTransactionService } from '../inventory/physical/inventory-authority-transaction.service';
import { ReceiptPhysicalIntegrationService } from '../inventory/physical/receipt-physical-integration.service';
import { ForbiddenException } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IdempotencyScope,
  InventoryMovementType,
  Prisma,
  ProductLotTracking,
  PurchaseStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { EquipmentProvisioningService } from '../equipment/equipment-provisioning.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseReceiptItemDto } from './dto/create-purchase-receipt-item.dto';
import { CreatePurchaseReceiptDto } from './dto/create-purchase-receipt.dto';
import { createPurchaseReceiptRequestHash } from './purchase-receipt-request-hash';

const PURCHASE_RECEIPT_CREATE_SCOPE = IdempotencyScope.PURCHASE_RECEIPT_CREATE;
const IDEMPOTENCY_PAYLOAD_CONFLICT_MESSAGE =
  'La clave de idempotencia ya fue utilizada con una solicitud diferente';

const createReceiptResponseInclude = {
  purchase: {
    select: {
      id: true,
      folio: true,
      status: true,
    },
  },
  items: {
    include: {
      // The receipt response only exposes these catalog fields. Selecting all
      // Product columns couples receipt replay to future catalog migrations.
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
        },
      },
      batch: true,
    },
  },
} satisfies Prisma.PurchaseReceiptInclude;

interface NormalizedReceiptItem {
  purchaseItemId: string;
  productId: string;
  quantityReceived: number;
  unitCost: number;
  lotNumber?: string;
  expirationDate?: string;
}

interface ValidatedReceiptItem extends Omit<
  NormalizedReceiptItem,
  'expirationDate'
> {
  expirationDate?: Date;
}

interface ReceiptProduct {
  id: string;
  sku: string;
  lotTracking: ProductLotTracking;
}

interface RegisterBatchData {
  companyId: string;
  productId: string;
  lotNumber: string;
  expirationDate?: Date;
  quantityReceived: number;
  unitCost: number;
  receivedAt: Date;
}

@Injectable()
export class PurchaseReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly equipmentProvisioningService: EquipmentProvisioningService,
    private readonly authority: InventoryAuthorityTransactionService,
    private readonly physical: ReceiptPhysicalIntegrationService,
  ) {}

  // Advisory UI capability only; create() resolves authority again under its own fence.
  async getReceiptCapabilities(companyId: string) {
    return this.authority.run(companyId, (_tx, authority) =>
      Promise.resolve({ authority }),
    );
  }

  async create(
    companyId: string,
    receivedBy: string | undefined,
    idempotencyKey: string,
    dto: CreatePurchaseReceiptDto,
  ) {
    this.validateDuplicatedItems(dto.items);

    const supplierDocumentNumber = this.normalizeOptionalText(
      dto.supplierDocumentNumber,
    );
    if (Boolean(dto.supplierDocumentType) !== Boolean(supplierDocumentNumber)) {
      throw new BadRequestException(
        'Selecciona el tipo y número del documento del proveedor, o deja ambos vacíos',
      );
    }
    dto = { ...dto, supplierDocumentNumber };

    const requestHash = createPurchaseReceiptRequestHash(dto);

    try {
      return await this.authority.run(companyId, async (tx, authority) => {
        const replay = await this.findCompletedIdempotentReceipt(
          tx,
          companyId,
          idempotencyKey,
          requestHash,
        );
        if (replay) return replay;
        if (authority === 'PHYSICAL') {
          if (!receivedBy) throw new ForbiddenException();
          const receipt = await this.physical.execute(
            tx,
            companyId,
            receivedBy,
            idempotencyKey,
            dto,
          );
          return tx.purchaseReceipt.findFirstOrThrow({
            where: { id: receipt.id, companyId },
            include: createReceiptResponseInclude,
          });
        }
        const idempotencyRecord = await tx.idempotencyRecord.create({
          data: {
            companyId,
            scope: PURCHASE_RECEIPT_CREATE_SCOPE,
            key: idempotencyKey,
            requestHash,
          },
        });

        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Purchase" WHERE id=${dto.purchaseId} AND "companyId"=${companyId} FOR UPDATE`,
        );
        const receivedAt = new Date();

        const purchase = await tx.purchase.findFirst({
          where: {
            id: dto.purchaseId,
            companyId,
          },
          include: {
            items: {
              include: {
                receiptItems: {
                  select: {
                    quantityReceived: true,
                  },
                },
              },
            },
          },
        });

        if (!purchase) {
          throw new NotFoundException('Compra no encontrada');
        }

        this.validatePurchaseStatus(purchase.status);

        const purchaseItemsById = new Map(
          purchase.items.map((item) => [item.id, item]),
        );

        const normalizedItems: NormalizedReceiptItem[] = dto.items.map(
          (inputItem) => {
            const purchaseItem = purchaseItemsById.get(
              inputItem.purchaseItemId,
            );

            if (!purchaseItem) {
              throw new BadRequestException(
                `La partida ${inputItem.purchaseItemId} no pertenece a la compra`,
              );
            }

            const previouslyReceived = purchaseItem.receiptItems.reduce(
              (total, receiptItem) => total + receiptItem.quantityReceived,
              0,
            );

            const pendingQuantity = purchaseItem.quantity - previouslyReceived;

            if (pendingQuantity <= 0) {
              throw new BadRequestException(
                `La partida ${purchaseItem.id} ya fue recibida completamente`,
              );
            }

            if (inputItem.quantityReceived > pendingQuantity) {
              throw new BadRequestException(
                `La cantidad recibida de la partida ${purchaseItem.id} supera la cantidad pendiente (${pendingQuantity})`,
              );
            }

            const lotNumber = this.normalizeOptionalText(inputItem.lotNumber);

            return {
              purchaseItemId: purchaseItem.id,
              productId: purchaseItem.productId,
              quantityReceived: inputItem.quantityReceived,
              unitCost: purchaseItem.price,
              lotNumber,
              expirationDate: inputItem.expirationDate,
            };
          },
        );

        const ids = [
          ...new Set(normalizedItems.map((i) => i.productId)),
        ].sort();
        const tracking = await tx.product.findMany({
          where: { companyId, id: { in: ids } },
          select: { id: true, inventoryTracking: true },
        });
        const codes = new Map<string, string[]>();
        for (const item of normalizedItems) {
          if (
            tracking.find((p) => p.id === item.productId)?.inventoryTracking ===
            'ASSET'
          )
            codes.set(
              item.purchaseItemId,
              await this.equipmentProvisioningService.prepareReceiptCodes(
                tx,
                companyId,
                item.quantityReceived,
              ),
            );
        }
        for (const id of ids)
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM "Product" WHERE id=${id} AND "companyId"=${companyId} FOR UPDATE`,
          );
        const lockedTracking = await tx.product.findMany({
          where: { companyId, id: { in: ids } },
          select: { id: true, inventoryTracking: true },
        });
        if (
          lockedTracking.some(
            (p) =>
              tracking.find((x) => x.id === p.id)?.inventoryTracking !==
              p.inventoryTracking,
          )
        )
          throw new ConflictException('Product tracking changed');
        const productsById = await this.validateProducts(
          tx,
          companyId,
          normalizedItems.map((item) => item.productId),
        );

        this.validateLotTracking(normalizedItems, productsById);

        const validatedItems: ValidatedReceiptItem[] = normalizedItems.map(
          (item) => ({
            ...item,
            expirationDate: this.parseExpirationDate(
              item.expirationDate,
              receivedAt,
            ),
          }),
        );

        const receipt = await tx.purchaseReceipt.create({
          data: {
            companyId,
            purchaseId: purchase.id,
            folio: this.generateFolio(),
            receivedAt,
            receivedBy,
            notes: this.normalizeOptionalText(dto.notes),
            supplierDocumentType: dto.supplierDocumentType,
            supplierDocumentNumber,
          },
        });

        for (const item of validatedItems) {
          const batch = item.lotNumber
            ? await this.registerBatch(tx, {
                companyId,
                productId: item.productId,
                lotNumber: item.lotNumber,
                expirationDate: item.expirationDate,
                quantityReceived: item.quantityReceived,
                unitCost: item.unitCost,
                receivedAt,
              })
            : undefined;

          const createdReceiptItem = await tx.purchaseReceiptItem.create({
            data: {
              companyId,
              receiptId: receipt.id,
              purchaseItemId: item.purchaseItemId,
              productId: item.productId,
              quantityReceived: item.quantityReceived,
              lotNumber: item.lotNumber,
              expirationDate: item.expirationDate,
              unitCost: item.unitCost,
              batchId: batch?.id,
            },
          });

          await this.equipmentProvisioningService.provisionFromPurchaseReceiptItem(
            tx,
            companyId,
            createdReceiptItem.id,
            receivedBy,
            codes.get(item.purchaseItemId),
          );

          const updatedProduct = await tx.product.update({
            where: {
              id_companyId: {
                id: item.productId,
                companyId,
              },
            },
            data: {
              stock: {
                increment: item.quantityReceived,
              },
            },
            select: {
              stock: true,
            },
          });

          await tx.inventoryMovement.create({
            data: {
              companyId,
              productId: item.productId,
              batchId: batch?.id,
              movementType: InventoryMovementType.IN,
              quantity: item.quantityReceived,
              balance: updatedProduct.stock,
              referenceType: 'PURCHASE_RECEIPT',
              referenceId: receipt.id,
              notes: `Recepción ${receipt.folio} de compra ${purchase.folio}`,
              createdBy: receivedBy,
              unitCost: item.unitCost,
            },
          });
        }

        const receivedInCurrentRequest = new Map(
          validatedItems.map((item) => [
            item.purchaseItemId,
            item.quantityReceived,
          ]),
        );

        const purchaseWasFullyReceived = purchase.items.every(
          (purchaseItem) => {
            const previouslyReceived = purchaseItem.receiptItems.reduce(
              (total, receiptItem) => total + receiptItem.quantityReceived,
              0,
            );

            const currentlyReceived =
              receivedInCurrentRequest.get(purchaseItem.id) ?? 0;

            return (
              previouslyReceived + currentlyReceived >= purchaseItem.quantity
            );
          },
        );

        const purchaseUpdateResult = await tx.purchase.updateMany({
          where: {
            id: purchase.id,
            companyId,
          },
          data: {
            status: purchaseWasFullyReceived
              ? PurchaseStatus.RECEIVED
              : PurchaseStatus.PARTIALLY_RECEIVED,
          },
        });

        if (purchaseUpdateResult.count === 0) {
          throw new NotFoundException('Compra no encontrada');
        }

        await tx.idempotencyRecord.update({
          where: {
            id: idempotencyRecord.id,
          },
          data: {
            resourceId: receipt.id,
          },
        });

        return tx.purchaseReceipt.findUniqueOrThrow({
          where: {
            id: receipt.id,
          },
          include: createReceiptResponseInclude,
        });
      });
    } catch (error: unknown) {
      if (!this.isConcurrentIdempotencyError(error)) {
        inventoryWriterError(error);
      }

      const concurrentReplay = await this.authority.run(companyId, (tx) =>
        this.findCompletedIdempotentReceipt(
          tx,
          companyId,
          idempotencyKey,
          requestHash,
        ),
      );

      if (concurrentReplay) {
        return concurrentReplay;
      }

      throw error;
    }
  }

  async findAll(companyId: string) {
    return this.prisma.purchaseReceipt.findMany({
      where: {
        companyId,
      },
      include: {
        receivedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        purchase: {
          select: {
            id: true,
            folio: true,
            status: true,
            supplier: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
              },
            },
            batch: true,
          },
        },
      },
      orderBy: {
        receivedAt: 'desc',
      },
    });
  }

  async findOne(companyId: string, receiptId: string) {
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: {
        id: receiptId,
        companyId,
      },
      include: {
        receivedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        purchase: {
          include: {
            supplier: true,
          },
        },
        items: {
          include: {
            product: true,
            batch: true,
            equipmentAssets: {
              where: {
                companyId,
              },
              select: {
                id: true,
                assetCode: true,
                serialNumber: true,
                lifecycle: true,
                condition: true,
                origin: true,
                purchaseReceiptItemId: true,
                batchId: true,
                createdAt: true,
                product: {
                  select: {
                    id: true,
                    sku: true,
                    name: true,
                  },
                },
                batch: {
                  select: {
                    id: true,
                    lotNumber: true,
                  },
                },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException('Recepción no encontrada');
    }

    const inventoryMovements = await this.prisma.inventoryMovement.findMany({
      where: {
        companyId,
        referenceType: 'PURCHASE_RECEIPT',
        referenceId: receipt.id,
      },
      select: {
        id: true,
        productId: true,
        movementType: true,
        quantity: true,
        balance: true,
        unitCost: true,
        referenceType: true,
        referenceId: true,
        notes: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      ...receipt,
      inventoryMovements,
    };
  }

  async findByPurchase(companyId: string, purchaseId: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: {
        id: purchaseId,
        companyId,
      },
      select: {
        id: true,
      },
    });

    if (!purchase) {
      throw new NotFoundException('Compra no encontrada');
    }

    return this.prisma.purchaseReceipt.findMany({
      where: {
        companyId,
        purchaseId,
      },
      include: {
        receivedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
              },
            },
            batch: true,
          },
        },
      },
      orderBy: {
        receivedAt: 'desc',
      },
    });
  }

  private async findCompletedIdempotentReceipt(
    tx: Prisma.TransactionClient,
    companyId: string,
    idempotencyKey: string,
    requestHash: string,
  ) {
    const record = await tx.idempotencyRecord.findUnique({
      where: {
        companyId_scope_key: {
          companyId,
          scope: PURCHASE_RECEIPT_CREATE_SCOPE,
          key: idempotencyKey,
        },
      },
    });

    if (!record) {
      return null;
    }

    if (record.requestHash !== requestHash) {
      throw new ConflictException(IDEMPOTENCY_PAYLOAD_CONFLICT_MESSAGE);
    }

    if (!record.resourceId) {
      return null;
    }

    const receipt = await tx.purchaseReceipt.findFirst({
      where: {
        id: record.resourceId,
        companyId,
      },
      include: createReceiptResponseInclude,
    });

    if (!receipt) {
      throw new NotFoundException('Recepción no encontrada');
    }

    return receipt;
  }

  private isConcurrentIdempotencyError(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;

    if (Array.isArray(target)) {
      const fields = target.map(String);

      return ['companyId', 'scope', 'key'].every((field) =>
        fields.includes(field),
      );
    }

    return (
      typeof target === 'string' &&
      target.includes('IdempotencyRecord_companyId_scope_key_key')
    );
  }

  private validateDuplicatedItems(items: CreatePurchaseReceiptItemDto[]): void {
    const purchaseItemIds = new Set<string>();

    for (const item of items) {
      if (purchaseItemIds.has(item.purchaseItemId)) {
        throw new BadRequestException(
          `La partida ${item.purchaseItemId} está repetida en la recepción`,
        );
      }

      purchaseItemIds.add(item.purchaseItemId);
    }
  }

  private validatePurchaseStatus(status: PurchaseStatus): void {
    if (status === PurchaseStatus.DRAFT) {
      throw new BadRequestException(
        'La compra debe confirmarse antes de recibir mercancía',
      );
    }

    if (status === PurchaseStatus.RECEIVED) {
      throw new BadRequestException('La compra ya fue recibida completamente');
    }

    if (status === PurchaseStatus.CANCELLED) {
      throw new BadRequestException('No se puede recibir una compra cancelada');
    }

    if (
      status !== PurchaseStatus.CONFIRMED &&
      status !== PurchaseStatus.PARTIALLY_RECEIVED
    ) {
      throw new BadRequestException(
        'El estado de la compra no permite recibir mercancía',
      );
    }
  }

  private async validateProducts(
    tx: Prisma.TransactionClient,
    companyId: string,
    productIds: string[],
  ): Promise<Map<string, ReceiptProduct>> {
    const uniqueProductIds = [...new Set(productIds)];

    const products = await tx.product.findMany({
      where: {
        companyId,
        id: {
          in: uniqueProductIds,
        },
      },
      select: {
        id: true,
        sku: true,
        lotTracking: true,
      },
    });

    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    const missingProductId = uniqueProductIds.find(
      (productId) => !productsById.has(productId),
    );

    if (missingProductId) {
      throw new NotFoundException(`Producto ${missingProductId} no encontrado`);
    }

    return productsById;
  }

  private validateLotTracking(
    items: NormalizedReceiptItem[],
    productsById: Map<string, ReceiptProduct>,
  ): void {
    for (const item of items) {
      const product = productsById.get(item.productId);

      if (!product) {
        throw new NotFoundException(`Producto ${item.productId} no encontrado`);
      }

      if (
        product.lotTracking === ProductLotTracking.NONE &&
        (item.lotNumber || item.expirationDate)
      ) {
        throw new BadRequestException(
          `El producto ${product.sku} no permite seguimiento por lote`,
        );
      }

      if (
        product.lotTracking === ProductLotTracking.REQUIRED &&
        !item.lotNumber
      ) {
        throw new BadRequestException(
          `El producto ${product.sku} requiere número de lote`,
        );
      }

      if (item.expirationDate && !item.lotNumber) {
        throw new BadRequestException(
          'No se puede registrar una fecha de caducidad sin número de lote',
        );
      }
    }
  }

  private async registerBatch(
    tx: Prisma.TransactionClient,
    data: RegisterBatchData,
  ) {
    const existingBatch = await tx.inventoryBatch.findUnique({
      where: {
        companyId_productId_lotNumber: {
          companyId: data.companyId,
          productId: data.productId,
          lotNumber: data.lotNumber,
        },
      },
    });

    if (!existingBatch) {
      return tx.inventoryBatch.create({
        data: {
          companyId: data.companyId,
          productId: data.productId,
          lotNumber: data.lotNumber,
          expirationDate: data.expirationDate,
          initialQuantity: data.quantityReceived,
          availableQuantity: data.quantityReceived,
          unitCost: data.unitCost,
          receivedAt: data.receivedAt,
        },
      });
    }

    this.validateBatchExpirationDate(
      existingBatch.expirationDate,
      data.expirationDate,
      data.lotNumber,
    );

    const newInitialQuantity =
      existingBatch.initialQuantity + data.quantityReceived;

    const weightedUnitCost =
      (existingBatch.unitCost * existingBatch.initialQuantity +
        data.unitCost * data.quantityReceived) /
      newInitialQuantity;

    return tx.inventoryBatch.update({
      where: {
        id_companyId: {
          id: existingBatch.id,
          companyId: data.companyId,
        },
      },
      data: {
        initialQuantity: {
          increment: data.quantityReceived,
        },
        availableQuantity: {
          increment: data.quantityReceived,
        },
        unitCost: weightedUnitCost,
        expirationDate: existingBatch.expirationDate ?? data.expirationDate,
        isActive: true,
      },
    });
  }

  private validateBatchExpirationDate(
    existingExpirationDate: Date | null,
    receivedExpirationDate: Date | undefined,
    lotNumber: string,
  ): void {
    if (!existingExpirationDate || !receivedExpirationDate) {
      return;
    }

    if (existingExpirationDate.getTime() !== receivedExpirationDate.getTime()) {
      throw new BadRequestException(
        `El lote ${lotNumber} ya existe con una fecha de caducidad diferente`,
      );
    }
  }

  private parseExpirationDate(
    value: string | undefined,
    receivedAt: Date,
  ): Date | undefined {
    if (!value) {
      return undefined;
    }

    const expirationDate = new Date(value);

    const expirationDay = Date.UTC(
      expirationDate.getUTCFullYear(),
      expirationDate.getUTCMonth(),
      expirationDate.getUTCDate(),
    );

    const receivedDay = Date.UTC(
      receivedAt.getUTCFullYear(),
      receivedAt.getUTCMonth(),
      receivedAt.getUTCDate(),
    );

    if (expirationDay < receivedDay) {
      throw new BadRequestException(
        'La fecha de caducidad no puede ser anterior a la fecha de recepción',
      );
    }

    return expirationDate;
  }

  private normalizeOptionalText(value: string | undefined): string | undefined {
    const normalizedValue = value?.trim();

    return normalizedValue || undefined;
  }

  private generateFolio(): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');

    const suffix = randomUUID().slice(0, 8).toUpperCase();

    return `REC-${date}-${suffix}`;
  }
}
