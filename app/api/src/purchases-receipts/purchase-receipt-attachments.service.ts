import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Receipt-owned file metadata: no supplier document required.
 * No object store dependency, download URLs or scan-state mutation.
 */
@Injectable()
export class PurchaseReceiptAttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, actorId: string, receiptId: string) {
    const actor = await this.prisma.user.findFirst({
      where: { id: actorId, companyId, isActive: true },
      select: { role: true },
    });
    if (
      !actor ||
      (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER)
    ) {
      throw new ForbiddenException('Sin permiso para consultar adjuntos');
    }

    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id: receiptId, companyId },
      select: { id: true },
    });
    if (!receipt) throw new NotFoundException('Recepción no encontrada');

    return this.prisma.purchaseReceiptAttachment.findMany({
      where: { companyId, receiptId },
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
  }
}
