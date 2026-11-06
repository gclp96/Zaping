import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  SupplierAttachmentUploadReservationStatus,
  SupplierDocumentStatus,
  UserRole,
} from '@prisma/client';
import { SupplierAttachmentQaBinaryUploadService } from './supplier-attachment-qa-binary-upload.service';

describe('ZFILES QA raw PDF/JPEG quarantine ingestion', () => {
  const companyId = randomUUID();
  const documentId = randomUUID();
  const actorId = randomUUID();
  const reservationId = randomUUID();
  const bytes = Buffer.from('%PDF-1.7\nverified\n%%EOF\n');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const reservation = {
    id: reservationId,
    companyId,
    documentId,
    createdById: actorId,
    status: SupplierAttachmentUploadReservationStatus.RESERVED,
    originalName: 'factura.pdf',
    contentType: 'application/pdf',
    sizeBytes: bytes.length,
    sha256,
    quarantineKey: `quarantine/${companyId}/${documentId}/${reservationId}`,
  };
  const prisma = {
    user: { findFirst: jest.fn() },
    supplierAttachmentUploadReservation: { findFirst: jest.fn() },
  };
  const writer = { put: jest.fn() };
  const service = new SupplierAttachmentQaBinaryUploadService(
    prisma as never,
    writer,
  );
  const input = () => ({
    companyId,
    documentId,
    actorId,
    reservationId,
    declaredLength: String(bytes.length),
    contentType: 'application/pdf',
    contentEncoding: undefined,
    transferEncoding: undefined,
    source: Readable.from([bytes]),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findFirst.mockResolvedValue({ role: UserRole.ADMIN });
    prisma.supplierAttachmentUploadReservation.findFirst.mockResolvedValue(
      reservation,
    );
    writer.put.mockResolvedValue(undefined);
  });

  it('verifies metadata and bytes and writes only a canonical quarantine key', async () => {
    const result = await service.receive(input());
    expect(result).toEqual({
      id: reservationId,
      status: 'QUARANTINE_WRITE_ACKNOWLEDGED_UNVERIFIED',
    });
    expect(
      prisma.supplierAttachmentUploadReservation.findFirst,
    ).toHaveBeenCalledWith({
      where: {
        id: reservationId,
        companyId,
        documentId,
        createdById: actorId,
        status: SupplierAttachmentUploadReservationStatus.RESERVED,
        document: { is: { status: SupplierDocumentStatus.ACTIVE } },
      },
    });
    expect(writer.put).toHaveBeenCalledWith(
      companyId,
      reservation.quarantineKey,
      expect.objectContaining({
        bytes,
        metadata: expect.objectContaining({
          sha256,
          contentType: 'application/pdf',
        }) as unknown,
      }),
    );
  });

  it('denies an inactive or non-management actor before any object access', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: UserRole.SALES });
    await expect(service.receive(input())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(writer.put).not.toHaveBeenCalled();
  });

  it('denies missing or other-tenant reservations', async () => {
    prisma.supplierAttachmentUploadReservation.findFirst.mockResolvedValue(
      null,
    );
    await expect(service.receive(input())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(writer.put).not.toHaveBeenCalled();
  });

  it('never puts a different digest or forged storage key', async () => {
    prisma.supplierAttachmentUploadReservation.findFirst.mockResolvedValue({
      ...reservation,
      sha256: '0'.repeat(64),
    });
    await expect(service.receive(input())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(writer.put).not.toHaveBeenCalled();

    prisma.supplierAttachmentUploadReservation.findFirst.mockResolvedValue({
      ...reservation,
      quarantineKey: `quarantine/${randomUUID()}/${documentId}/${reservationId}`,
    });
    await expect(service.receive(input())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(writer.put).not.toHaveBeenCalled();
  });

  it('rejects mismatched Content-Length, encoding and over-quota bytes', async () => {
    await expect(
      service.receive({ ...input(), declaredLength: '10485761' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.receive({ ...input(), contentEncoding: 'gzip' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.receive({ ...input(), declaredLength: '5' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(writer.put).not.toHaveBeenCalled();
  });

  it('does not acknowledge a failed R2 PUT as clean or available', async () => {
    writer.put.mockRejectedValue(new Error('private R2 unavailable'));
    await expect(service.receive(input())).rejects.toThrow(
      'private R2 unavailable',
    );
  });
});
