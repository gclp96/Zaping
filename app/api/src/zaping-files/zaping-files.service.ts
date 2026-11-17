import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ZapingFile, ZapingFileScanStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  FILE_MAX_PER_RECEIPT,
  IncomingFile,
  validateIncomingFile,
} from './file-validation';
import { R2StorageService } from './r2-storage.service';

const publicFile = (file: ZapingFile) => ({
  id: file.id,
  originalName: file.originalName,
  contentType: file.contentType,
  sizeBytes: file.sizeBytes,
  sha256: file.sha256,
  scanStatus: file.scanStatus,
  createdAt: file.createdAt,
});

@Injectable()
export class ZapingFilesService {
  private readonly logger = new Logger(ZapingFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2StorageService,
    private readonly config: ConfigService,
  ) {}

  private async ensureReceipt(
    companyId: string,
    receiptId: string,
  ): Promise<void> {
    const receipt = await this.prisma.purchaseReceipt.findFirst({
      where: { id: receiptId, companyId },
      select: { id: true },
    });
    if (!receipt) {
      throw new NotFoundException('Recepción no encontrada');
    }
  }

  async list(companyId: string, receiptId: string) {
    await this.ensureReceipt(companyId, receiptId);
    const links = await this.prisma.zapingFileReceiptLink.findMany({
      where: {
        companyId,
        receiptId,
        file: { deletedAt: null },
      },
      select: { file: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: FILE_MAX_PER_RECEIPT,
    });
    return links.map((link) => publicFile(link.file));
  }

  async upload(
    companyId: string,
    actorId: string,
    receiptId: string,
    incoming: IncomingFile | undefined,
  ) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException(
        'Carga de archivos no habilitada en producción sin análisis antivirus',
      );
    }
    const file = validateIncomingFile(incoming);
    await this.ensureReceipt(companyId, receiptId);

    // Server-controlled key. Never trust a path or tenant identifier supplied by a client.
    const objectKey = [
      'tenants',
      companyId,
      'purchase-receipts',
      receiptId,
      randomUUID() + '.' + file.extension,
    ].join('/');
    await this.storage.upload(objectKey, file.bytes, file.contentType);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize concurrent uploads using a tenant-scoped row lock.
        const locked = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "PurchaseReceipt" WHERE "id"=${receiptId} AND "companyId"=${companyId} FOR UPDATE`,
        );
        if (locked.length !== 1)
          throw new NotFoundException('Recepción no encontrada');
        const count = await tx.zapingFileReceiptLink.count({
          where: { companyId, receiptId, file: { deletedAt: null } },
        });
        if (count >= FILE_MAX_PER_RECEIPT) {
          throw new ConflictException('Máximo 5 adjuntos por recepción');
        }

        const created = await tx.zapingFile.create({
          data: {
            companyId,
            objectKey,
            originalName: file.originalName,
            contentType: file.contentType,
            sizeBytes: file.sizeBytes,
            sha256: file.sha256,
            scanStatus: ZapingFileScanStatus.NOT_SCANNED,
            uploadedById: actorId,
          },
        });
        await tx.zapingFileReceiptLink.create({
          data: { companyId, receiptId, fileId: created.id },
        });
        await tx.zapingFileEvent.create({
          data: { companyId, fileId: created.id, actorId, type: 'UPLOADED' },
        });
        return publicFile(created);
      });
    } catch (error) {
      // Best effort: a process crash can still create an orphan; reconcile separately.
      try {
        await this.storage.discardUnlinkedObject(objectKey);
      } catch {
        this.logger.error(
          'Zaping Files: orphan cleanup failed; review storage reconciliation',
        );
      }
      throw error;
    }
  }

  private async requireLinkedFile(
    companyId: string,
    receiptId: string,
    fileId: string,
  ) {
    const file = await this.prisma.zapingFile.findFirst({
      where: {
        companyId,
        id: fileId,
        deletedAt: null,
        receiptLinks: { some: { companyId, receiptId } },
      },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    return file;
  }

  async download(
    companyId: string,
    actorId: string,
    receiptId: string,
    fileId: string,
  ) {
    const file = await this.requireLinkedFile(companyId, receiptId, fileId);

    // No scanner is part of this slice; production must not serve unscanned files.
    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      file.scanStatus !== ZapingFileScanStatus.CLEAN
    ) {
      throw new ForbiddenException('Archivo pendiente de análisis antivirus');
    }
    if (
      file.scanStatus === ZapingFileScanStatus.INFECTED ||
      file.scanStatus === ZapingFileScanStatus.SCAN_FAILED ||
      file.scanStatus === ZapingFileScanStatus.PENDING_SCAN
    ) {
      throw new ForbiddenException('Archivo no disponible');
    }

    const bytes = await this.storage.download(
      file.objectKey,
      file.sizeBytes,
      file.sha256,
    );
    await this.prisma.zapingFileEvent.create({
      data: { companyId, fileId, actorId, type: 'DOWNLOAD_REQUESTED' },
    });
    return { bytes, name: file.originalName };
  }

  async remove(
    companyId: string,
    actorId: string,
    receiptId: string,
    fileId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const file = await tx.zapingFile.findFirst({
        where: {
          id: fileId,
          companyId,
          deletedAt: null,
          receiptLinks: { some: { companyId, receiptId } },
        },
        select: { id: true },
      });
      if (!file) throw new NotFoundException('Archivo no encontrado');

      const changed = await tx.zapingFile.updateMany({
        where: { id: file.id, companyId, deletedAt: null },
        data: { deletedAt: new Date(), deletedById: actorId },
      });
      if (changed.count !== 1) {
        throw new ConflictException('El archivo ya fue retirado');
      }
      await tx.zapingFileEvent.create({
        data: { companyId, fileId, actorId, type: 'SOFT_DELETED' },
      });
    });
    return { removed: true };
  }
}
