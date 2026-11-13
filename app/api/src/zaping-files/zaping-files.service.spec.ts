import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ZapingFileScanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from './r2-storage.service';
import { ZapingFilesService } from './zaping-files.service';

describe('ZapingFilesService', () => {
  const companyId = 'company-a';
  const receiptId = 'receipt-a';
  const actorId = 'user-a';
  const pdf = Buffer.from('%PDF-1.7\nSafe payload\n%%EOF\n');
  const file = {
    id: 'file-a',
    companyId,
    objectKey: 'tenants/company-a/purchase-receipts/receipt-a/file.pdf',
    originalName: 'test.pdf',
    contentType: 'application/pdf',
    sizeBytes: pdf.length,
    sha256: 'a'.repeat(64),
    scanStatus: ZapingFileScanStatus.NOT_SCANNED,
    uploadedById: actorId,
    createdAt: new Date(),
    deletedAt: null,
    deletedById: null,
  };

  let service: ZapingFilesService;
  let tx: {
    $queryRaw: jest.Mock;
    zapingFileReceiptLink: { count: jest.Mock; create: jest.Mock };
    zapingFile: {
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    zapingFileEvent: { create: jest.Mock };
  };
  let prisma: {
    purchaseReceipt: { findFirst: jest.Mock };
    zapingFileReceiptLink: { findMany: jest.Mock };
    zapingFile: { findFirst: jest.Mock };
    zapingFileEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let storage: {
    upload: jest.Mock;
    download: jest.Mock;
    discardUnlinkedObject: jest.Mock;
  };
  let config: { get: jest.Mock };

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: receiptId }]),
      zapingFileReceiptLink: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
      zapingFile: {
        create: jest.fn().mockResolvedValue(file),
        findFirst: jest.fn().mockResolvedValue(file),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      zapingFileEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      purchaseReceipt: {
        findFirst: jest.fn().mockResolvedValue({ id: receiptId }),
      },
      zapingFileReceiptLink: { findMany: jest.fn().mockResolvedValue([]) },
      zapingFile: { findFirst: jest.fn().mockResolvedValue(file) },
      zapingFileEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(
        async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      download: jest.fn().mockResolvedValue(pdf),
      discardUnlinkedObject: jest.fn().mockResolvedValue(undefined),
    };
    config = { get: jest.fn().mockReturnValue('development') };
    service = new ZapingFilesService(
      prisma as unknown as PrismaService,
      storage as unknown as R2StorageService,
      config as unknown as ConfigService,
    );
  });

  it('never calls R2 if the receipt does not belong to the authenticated tenant', async () => {
    prisma.purchaseReceipt.findFirst.mockResolvedValue(null);
    await expect(
      service.upload(companyId, actorId, 'foreign', {
        buffer: pdf,
        size: pdf.length,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('uploads only tenant-derived keys and persists audit data', async () => {
    const result = await service.upload(companyId, actorId, receiptId, {
      buffer: pdf,
      size: pdf.length,
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
    });
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(
        /^tenants\/company-a\/purchase-receipts\/receipt-a\//,
      ),
      pdf,
      'application/pdf',
    );
    expect(tx.zapingFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId,
          uploadedById: actorId,
          scanStatus: 'NOT_SCANNED',
        }),
      }),
    );
    expect(tx.zapingFileEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'UPLOADED' }),
      }),
    );
    expect(result).not.toHaveProperty('objectKey');
  });

  it('prevents exceeding the per-receipt limit and compensates R2', async () => {
    tx.zapingFileReceiptLink.count.mockResolvedValue(5);
    await expect(
      service.upload(companyId, actorId, receiptId, {
        buffer: pdf,
        size: pdf.length,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      }),
    ).rejects.toThrow(ConflictException);
    expect(storage.discardUnlinkedObject).toHaveBeenCalledTimes(1);
    expect(tx.zapingFile.create).not.toHaveBeenCalled();
  });

  it('does not ingest third-party files in production without scanner', async () => {
    config.get.mockReturnValue('production');
    await expect(
      service.upload(companyId, actorId, receiptId, {
        buffer: pdf,
        size: pdf.length,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
      }),
    ).rejects.toThrow('Carga de archivos no habilitada');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('denies download of unscanned files in production', async () => {
    config.get.mockReturnValue('production');
    await expect(
      service.download(companyId, actorId, receiptId, file.id),
    ).rejects.toThrow(ForbiddenException);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('requires file membership for read and never returns foreign objects', async () => {
    prisma.zapingFile.findFirst.mockResolvedValue(null);
    await expect(
      service.download(companyId, actorId, receiptId, 'foreign-file'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.zapingFile.findFirst).toHaveBeenCalledWith({
      where: {
        companyId,
        id: 'foreign-file',
        deletedAt: null,
        receiptLinks: { some: { companyId, receiptId } },
      },
    });
  });

  it('records a download request only after storage integrity passes', async () => {
    const result = await service.download(
      companyId,
      actorId,
      receiptId,
      file.id,
    );
    expect(result.bytes).toEqual(pdf);
    expect(prisma.zapingFileEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DOWNLOAD_REQUESTED' }),
      }),
    );
    expect(storage.download).toHaveBeenCalledWith(
      file.objectKey,
      file.sizeBytes,
      file.sha256,
    );
  });

  it('soft-deletes a linked file with an audit event', async () => {
    const result = await service.remove(companyId, actorId, receiptId, file.id);
    expect(result).toEqual({ removed: true });
    expect(tx.zapingFile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: file.id, companyId, deletedAt: null },
      }),
    );
    expect(tx.zapingFileEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'SOFT_DELETED' }),
      }),
    );
  });
});
