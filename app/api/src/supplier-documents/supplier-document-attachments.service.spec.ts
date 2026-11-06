import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  SupplierDocumentAttachmentStatus,
  SupplierDocumentStatus,
} from '@prisma/client';
import { SupplierDocumentAttachmentsService } from './supplier-document-attachments.service';

describe('SupplierDocumentAttachmentsService', () => {
  const prisma = {
    supplierDocument: { findFirst: jest.fn() },
    supplierDocumentAttachment: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const storage = { openReadOnly: jest.fn() };
  const service = new SupplierDocumentAttachmentsService(
    prisma as never,
    storage,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.supplierDocument.findFirst.mockResolvedValue({ id: 'document-a' });
    prisma.supplierDocumentAttachment.findMany.mockResolvedValue([]);
    prisma.supplierDocumentAttachment.findFirst.mockResolvedValue(null);
  });

  it('never lists attachments without a tenant-scoped document', async () => {
    prisma.supplierDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.listAvailable('company-a', 'document-from-company-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supplierDocument.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 'company-a',
        id: 'document-from-company-b',
        status: SupplierDocumentStatus.ACTIVE,
      },
      select: { id: true },
    });
    expect(prisma.supplierDocumentAttachment.findMany).not.toHaveBeenCalled();
  });

  it('does not access private storage if the requesting tenant lacks the document', async () => {
    prisma.supplierDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.verifiedDownload('company-b', 'company-a-document', 'file-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.openReadOnly).not.toHaveBeenCalled();
  });

  it('does not access private storage when an attachment is missing or quarantined', async () => {
    await expect(
      service.verifiedDownload('company-a', 'document-a', 'quarantined-file'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supplierDocumentAttachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'company-a',
          documentId: 'document-a',
          id: 'quarantined-file',
          status: SupplierDocumentAttachmentStatus.AVAILABLE,
          removedAt: null,
        },
      }),
    );
    expect(storage.openReadOnly).not.toHaveBeenCalled();
  });

  it('rejects AVAILABLE metadata with a quarantine or cross-tenant object key', async () => {
    prisma.supplierDocumentAttachment.findFirst.mockResolvedValue({
      storageKey: 'quarantine/company-a/document-a/file-a',
      originalName: 'documento.pdf',
      contentType: 'application/pdf',
      sizeBytes: 18,
      sha256: 'a'.repeat(64),
    });
    await expect(
      service.verifiedDownload('company-a', 'document-a', 'file-a'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storage.openReadOnly).not.toHaveBeenCalled();

    prisma.supplierDocumentAttachment.findFirst.mockResolvedValue({
      storageKey: 'private/company-b/document-a/file-a',
      originalName: 'documento.pdf',
      contentType: 'application/pdf',
      sizeBytes: 18,
      sha256: 'a'.repeat(64),
    });
    await expect(
      service.verifiedDownload('company-a', 'document-a', 'file-a'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storage.openReadOnly).not.toHaveBeenCalled();
  });

  it('reads only the exact canonical private key after an authorized lookup', async () => {
    const bytes = Buffer.from('%PDF-1.7\\nverified\\n%%EOF\\n');
    prisma.supplierDocumentAttachment.findFirst.mockResolvedValue({
      storageKey: 'private/company-a/document-a/file-a',
      originalName: 'documento.pdf',
      contentType: 'application/pdf',
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    storage.openReadOnly.mockResolvedValue(Readable.from([bytes]));

    await expect(
      service.verifiedDownload('company-a', 'document-a', 'file-a'),
    ).resolves.toEqual({
      bytes,
      contentType: 'application/pdf',
      originalName: 'documento.pdf',
    });
    expect(storage.openReadOnly).toHaveBeenCalledWith(
      'private/company-a/document-a/file-a',
    );
  });

  it('returns only available metadata and never the private object key', async () => {
    await service.listAvailable('company-a', 'document-a');
    expect(prisma.supplierDocumentAttachment.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-a',
        documentId: 'document-a',
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
  });
});
