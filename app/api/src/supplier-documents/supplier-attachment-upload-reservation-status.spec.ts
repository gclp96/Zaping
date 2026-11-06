import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupplierAttachmentUploadReservationsService } from './supplier-attachment-upload-reservations.service';

describe('ZFILES reservation read-only recovery status', () => {
  const prisma = {
    user: { findFirst: jest.fn() },
    supplierAttachmentUploadReservation: { findFirst: jest.fn() },
  };
  const service = new SupplierAttachmentUploadReservationsService(
    prisma as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findFirst.mockResolvedValue({ role: 'ADMIN' });
    prisma.supplierAttachmentUploadReservation.findFirst.mockResolvedValue({
      id: 'reservation-a',
      status: 'RESERVED',
      sizeBytes: 512,
      createdAt: new Date('2026-11-05T00:00:00.000Z'),
    });
  });

  it('returns only public fields and scopes the lookup to actor, tenant and active document', async () => {
    const result = await service.status(
      'company-a',
      'document-a',
      'actor-a',
      'reservation-a',
    );
    expect(Object.keys(result).sort()).toEqual([
      'createdAt',
      'id',
      'sizeBytes',
      'status',
    ]);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'actor-a', companyId: 'company-a', isActive: true },
      select: { role: true },
    });
    expect(
      prisma.supplierAttachmentUploadReservation.findFirst,
    ).toHaveBeenCalledWith({
      where: {
        id: 'reservation-a',
        companyId: 'company-a',
        documentId: 'document-a',
        createdById: 'actor-a',
        document: { is: { status: 'ACTIVE' } },
      },
      select: {
        id: true,
        status: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
  });

  it('rejects inactive or non-management actors before DB reservation lookup', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.status('company-a', 'document-a', 'actor-a', 'reservation-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      prisma.supplierAttachmentUploadReservation.findFirst,
    ).not.toHaveBeenCalled();
    prisma.user.findFirst.mockResolvedValue({ role: 'SALES' });
    await expect(
      service.status('company-a', 'document-a', 'actor-a', 'reservation-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not reveal another actor or tenant reservation', async () => {
    prisma.supplierAttachmentUploadReservation.findFirst.mockResolvedValue(null);
    await expect(
      service.status('company-b', 'document-a', 'actor-b', 'reservation-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
