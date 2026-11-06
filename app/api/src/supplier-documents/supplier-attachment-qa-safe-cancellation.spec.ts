import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  SupplierAttachmentReconcileAction,
  SupplierAttachmentUploadReservationStatus,
  UserRole,
} from '@prisma/client';
import { SupplierAttachmentUploadReservationsService } from './supplier-attachment-upload-reservations.service';

describe('ZFILES QA pre-PUT cancellation fence', () => {
  const prisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    user: { findFirst: jest.fn() },
    supplierAttachmentUploadReservation: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    supplierAttachmentReconcileEvent: { create: jest.fn() },
  };
  const service = new SupplierAttachmentUploadReservationsService(
    prisma as never,
  );
  const scope = {
    companyId: 'company-a',
    documentId: 'document-a',
    actorId: 'actor-a',
    reservationId: 'reservation-a',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
    prisma.$queryRaw.mockResolvedValue([{ id: 'document-a' }]);
    prisma.user.findFirst.mockResolvedValue({ role: UserRole.ADMIN });
    prisma.supplierAttachmentUploadReservation.findFirst.mockResolvedValue({
      id: scope.reservationId,
      status: SupplierAttachmentUploadReservationStatus.RESERVED,
      writeAttemptedAt: null,
    });
    prisma.supplierAttachmentUploadReservation.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.supplierAttachmentReconcileEvent.create.mockResolvedValue({
      id: 'audit-event',
    });
  });

  it('audits before the atomic transition and releases only an unstarted reservation', async () => {
    await expect(service.cancelBeforeWrite(scope)).resolves.toEqual({
      id: scope.reservationId,
      status: SupplierAttachmentUploadReservationStatus.RELEASED_VERIFIED_EMPTY,
    });
    expect(prisma.supplierAttachmentReconcileEvent.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-a',
        reservationId: 'reservation-a',
        action: SupplierAttachmentReconcileAction.CANCELLED_BEFORE_WRITE,
      },
    });
    expect(
      prisma.supplierAttachmentUploadReservation.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        id: scope.reservationId,
        companyId: scope.companyId,
        documentId: scope.documentId,
        createdById: scope.actorId,
        status: SupplierAttachmentUploadReservationStatus.RESERVED,
        writeAttemptedAt: null,
      },
      data: {
        status: SupplierAttachmentUploadReservationStatus.RELEASED_VERIFIED_EMPTY,
      },
    });
    expect(prisma.supplierAttachmentReconcileEvent.create.mock.invocationCallOrder[0])
      .toBeLessThan(
        prisma.supplierAttachmentUploadReservation.updateMany.mock
          .invocationCallOrder[0],
      );
  });

  it('never releases a reservation after any write attempt, even if PUT failed', async () => {
    prisma.supplierAttachmentUploadReservation.findFirst.mockResolvedValue({
      id: scope.reservationId,
      status: SupplierAttachmentUploadReservationStatus.RESERVED,
      writeAttemptedAt: new Date('2026-11-05T00:00:00Z'),
    });
    await expect(service.cancelBeforeWrite(scope)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.supplierAttachmentReconcileEvent.create).not.toHaveBeenCalled();
    expect(prisma.supplierAttachmentUploadReservation.updateMany).not.toHaveBeenCalled();
  });

  it('does not release a reconciliation-required reservation', async () => {
    prisma.supplierAttachmentUploadReservation.findFirst.mockResolvedValue({
      id: scope.reservationId,
      status: SupplierAttachmentUploadReservationStatus.RECONCILE_REQUIRED,
      writeAttemptedAt: new Date(),
    });
    await expect(service.cancelBeforeWrite(scope)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns idempotent terminal cancellation without a second event', async () => {
    prisma.supplierAttachmentUploadReservation.findFirst.mockResolvedValue({
      id: scope.reservationId,
      status: SupplierAttachmentUploadReservationStatus.RELEASED_VERIFIED_EMPTY,
      writeAttemptedAt: null,
    });
    await expect(service.cancelBeforeWrite(scope)).resolves.toEqual({
      id: scope.reservationId,
      status: SupplierAttachmentUploadReservationStatus.RELEASED_VERIFIED_EMPTY,
    });
    expect(prisma.supplierAttachmentReconcileEvent.create).not.toHaveBeenCalled();
  });

  it('denies non-management actors and unknown documents before mutation', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: UserRole.SALES });
    await expect(service.cancelBeforeWrite(scope)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.supplierAttachmentUploadReservation.updateMany).not.toHaveBeenCalled();

    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.cancelBeforeWrite(scope)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rolls back the cancellation event when the guarded update does not match', async () => {
    prisma.supplierAttachmentUploadReservation.updateMany.mockResolvedValue({
      count: 0,
    });
    await expect(service.cancelBeforeWrite(scope)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.supplierAttachmentReconcileEvent.create).toHaveBeenCalledTimes(1);
  });
});
