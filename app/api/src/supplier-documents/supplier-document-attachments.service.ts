import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupplierDocumentAttachmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateAttachmentObjectStore } from './private-attachment-object-store';
import { consumeAndVerifyPrivateAttachment } from './supplier-document-attachment-download';

@Injectable()
export class SupplierDocumentAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PrivateAttachmentObjectStore,
  ) {}

  /**
   * Fail-closed inventory only. Do not expose storageKey, hash, scanner details
   * or download URLs. No object can be served until an isolated scanner has
   * accepted it and a separate authenticated download adapter is in place.
   */
  async listAvailable(companyId: string, documentId: string) {
    const document = await this.prisma.supplierDocument.findFirst({
      where: { companyId, id: documentId },
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    return this.prisma.supplierDocumentAttachment.findMany({
      where: {
        companyId,
        documentId,
        status: SupplierDocumentAttachmentStatus.AVAILABLE,
        removedAt: null,
      },
      select: {
        id: true,
        originalName: true,
        contentType: true,
        sizeBytes: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
    });
  }

  /**
   * Prepare an authenticated download without exposing any private key.
   * The exact object is opened only after both document and attachment pass
   * tenant scoping and positive scanner status. Bytes are buffered and hashed
   * prior to release, so a corrupted object is never partially streamed.
   */
  async verifiedDownload(
    companyId: string,
    documentId: string,
    attachmentId: string,
  ): Promise<{
    bytes: Buffer;
    contentType: 'application/pdf' | 'image/jpeg';
    originalName: string;
  }> {
    const document = await this.prisma.supplierDocument.findFirst({
      where: { companyId, id: documentId },
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('Adjunto no encontrado');
    }
    const item = await this.prisma.supplierDocumentAttachment.findFirst({
      where: {
        id: attachmentId,
        companyId,
        documentId,
        status: SupplierDocumentAttachmentStatus.AVAILABLE,
        removedAt: null,
      },
      select: {
        storageKey: true,
        originalName: true,
        contentType: true,
        sizeBytes: true,
        sha256: true,
      },
    });
    if (!item) {
      throw new NotFoundException('Adjunto no encontrado');
    }
    const contentType = item.contentType;
    if (contentType !== 'application/pdf' && contentType !== 'image/jpeg') {
      throw new ConflictException('Tipo de archivo almacenado inválido');
    }
    const source = await this.storage.openReadOnly(item.storageKey);
    const bytes = await consumeAndVerifyPrivateAttachment(
      source,
      item.sizeBytes,
      item.sha256,
    );
    return {
      bytes,
      contentType,
      originalName: item.originalName,
    };
  }
}
