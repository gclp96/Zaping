import { ServiceUnavailableException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';
import { SupplierAttachmentUploadReservationsController } from './supplier-attachment-upload-reservations.controller';

describe('ZFILES first-stage reservation endpoint', () => {
  const reservations = { reserve: jest.fn() };
  const controller = new SupplierAttachmentUploadReservationsController(
    reservations as never,
  );
  const req = { user: { companyId: 'company-a', id: 'actor-a' } } as never;
  const dto = {
    originalName: 'factura.pdf',
    contentType: 'application/pdf' as const,
    sizeBytes: 512,
    sha256: 'a'.repeat(64),
  };
  const originalFlag = process.env.ZFILES_QA_RESERVATIONS_ENABLED;
  const originalScope = process.env.ZFILES_DEPLOYMENT_SCOPE;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ZFILES_QA_RESERVATIONS_ENABLED;
    delete process.env.ZFILES_DEPLOYMENT_SCOPE;
  });

  afterAll(() => {
    if (originalFlag === undefined) {
      delete process.env.ZFILES_QA_RESERVATIONS_ENABLED;
    } else {
      process.env.ZFILES_QA_RESERVATIONS_ENABLED = originalFlag;
    }
    if (originalScope === undefined) {
      delete process.env.ZFILES_DEPLOYMENT_SCOPE;
    } else {
      process.env.ZFILES_DEPLOYMENT_SCOPE = originalScope;
    }
  });

  it('is off by default and does not access PostgreSQL', () => {
    expect(() =>
      controller.reserve(req, 'document-a', 'request-12345678', dto),
    ).toThrow(ServiceUnavailableException);
    expect(reservations.reserve).not.toHaveBeenCalled();
  });

  it('requires the QA deployment scope in addition to the explicit feature gate', () => {
    process.env.ZFILES_QA_RESERVATIONS_ENABLED = '1';
    process.env.ZFILES_DEPLOYMENT_SCOPE = 'production';
    expect(() =>
      controller.reserve(req, 'document-a', 'request-12345678', dto),
    ).toThrow(ServiceUnavailableException);
    expect(reservations.reserve).not.toHaveBeenCalled();
  });

  it('passes only trusted actor scope and validated DTO to the reservation ledger', async () => {
    process.env.ZFILES_QA_RESERVATIONS_ENABLED = '1';
    process.env.ZFILES_DEPLOYMENT_SCOPE = 'qa';
    reservations.reserve.mockResolvedValue({
      id: 'reserved-id',
      status: 'RESERVED',
      sizeBytes: 512,
    });
    await expect(
      controller.reserve(req, 'document-a', 'request-12345678', dto),
    ).resolves.toMatchObject({ status: 'RESERVED' });
    expect(reservations.reserve).toHaveBeenCalledWith({
      companyId: 'company-a',
      actorId: 'actor-a',
      documentId: 'document-a',
      requestKey: 'request-12345678',
      metadata: dto,
    });
  });

  it('retains both authentication and management-role guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SupplierAttachmentUploadReservationsController,
    ) as unknown[];
    expect(guards).toHaveLength(2);
    expect(
      Reflect.getMetadata(
        'roles',
        SupplierAttachmentUploadReservationsController,
      ),
    ).toEqual([UserRole.ADMIN, UserRole.MANAGER]);
  });
});
