import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReceiptDocumentLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, receiptId: string) {
    await this.requireReceipt(companyId, receiptId);

    return this.prisma.purchaseReceiptSupplierDocumentLink.findMany({
      where: { companyId, receiptId, removedAt: null },
      include: {
        document: {
          select: {
            id: true,
            type: true,
            series: true,
            number: true,
            documentDate: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async link(
    companyId: string,
    actorId: string,
    receiptId: string,
    documentId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const receipt = await tx.purchaseReceipt.findFirst({
          where: { id: receiptId, companyId },
          select: {
            id: true,
            purchaseId: true,
            purchase: { select: { supplierId: true } },
          },
        });
        if (!receipt) {
          throw new NotFoundException('Recepción no encontrada');
        }

        // Match reconciliation.execute: supplier lock before reading document status.
        const locked = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "Supplier" WHERE "id" = ${receipt.purchase.supplierId} AND "companyId" = ${companyId} FOR NO KEY UPDATE`,
        );
        if (locked.length !== 1)
          throw new NotFoundException('Proveedor no encontrado');
        const document = await tx.supplierDocument.findFirst({
          where: { id: documentId, companyId },
          select: { id: true, supplierId: true, status: true },
        });
        if (!document) {
          throw new NotFoundException('Documento no encontrado');
        }
        if (receipt.purchase.supplierId !== document.supplierId) {
          throw new ConflictException(
            'El proveedor del documento no coincide con la recepción',
          );
        }
        if (document.status !== 'ACTIVE') {
          throw new ConflictException(
            'No se puede vincular un documento cancelado',
          );
        }

        // PostgreSQL's partial unique index serializes simultaneous inserts.
        // createMany/skipDuplicates makes a replay return the existing active link.
        await tx.purchaseReceiptSupplierDocumentLink.createMany({
          data: [
            {
              companyId,
              purchaseId: receipt.purchaseId,
              supplierId: document.supplierId,
              receiptId,
              documentId,
              createdById: actorId,
            },
          ],
          skipDuplicates: true,
        });

        const current = await tx.purchaseReceiptSupplierDocumentLink.findFirst({
          where: { companyId, receiptId, documentId, removedAt: null },
        });
        if (!current) {
          throw new ConflictException(
            'No fue posible recuperar el vínculo documental',
          );
        }
        return current;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async unlink(
    companyId: string,
    actorId: string,
    receiptId: string,
    documentId: string,
    reason: string,
  ) {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10) {
      throw new BadRequestException(
        'El motivo debe tener al menos 10 caracteres',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const receipt = await tx.purchaseReceipt.findFirst({
          where: { id: receiptId, companyId },
          select: { purchase: { select: { supplierId: true } } },
        });
        if (!receipt) throw new NotFoundException('Recepción no encontrada');
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Supplier" WHERE "id" = ${receipt.purchase.supplierId} AND "companyId" = ${companyId} FOR NO KEY UPDATE`,
        );
        const changed = await tx.purchaseReceiptSupplierDocumentLink.updateMany(
          {
            where: { companyId, receiptId, documentId, removedAt: null },
            data: {
              removedAt: new Date(),
              removedById: actorId,
              reason: normalizedReason,
            },
          },
        );
        if (changed.count === 0)
          throw new NotFoundException(
            'Vínculo documental activo no encontrado',
          );
        return { unlinked: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private async requireReceipt(companyId: string, receiptId: string) {
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id: receiptId, companyId },
      select: { id: true },
    });
    if (!receipt) {
      throw new NotFoundException('Recepción no encontrada');
    }
  }
}
