import { ServiceUnavailableException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';
import { PurchaseReceiptAttachmentsController } from './purchase-receipt-attachments.controller';

describe('receipt-owned attachment HTTP read gate', () => {
  const service = { list: jest.fn() };
  const controller = new PurchaseReceiptAttachmentsController(service as never);
  const req = { user: { companyId: 'company-a', id: 'actor-a' } } as never;
  const initialScope = process.env.ZFILES_DEPLOYMENT_SCOPE;
  const initialGate = process.env.ZFILES_RECEIPT_ATTACHMENT_METADATA_QA_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ZFILES_DEPLOYMENT_SCOPE;
    delete process.env.ZFILES_RECEIPT_ATTACHMENT_METADATA_QA_ENABLED;
  });

  afterAll(() => {
    if (initialScope === undefined) {
      delete process.env.ZFILES_DEPLOYMENT_SCOPE;
    } else {
      process.env.ZFILES_DEPLOYMENT_SCOPE = initialScope;
    }
    if (initialGate === undefined) {
      delete process.env.ZFILES_RECEIPT_ATTACHMENT_METADATA_QA_ENABLED;
    } else {
      process.env.ZFILES_RECEIPT_ATTACHMENT_METADATA_QA_ENABLED = initialGate;
    }
  });

  it('stays closed even if only the feature switch is enabled', () => {
    process.env.ZFILES_RECEIPT_ATTACHMENT_METADATA_QA_ENABLED = '1';
    expect(() => controller.list(req, 'receipt-a')).toThrow(
      ServiceUnavailableException,
    );
    expect(service.list).not.toHaveBeenCalled();
  });

  it('stays closed if scope is QA but the feature flag is OFF', () => {
    process.env.ZFILES_DEPLOYMENT_SCOPE = 'qa';
    expect(() => controller.list(req, 'receipt-a')).toThrow(
      ServiceUnavailableException,
    );
    expect(service.list).not.toHaveBeenCalled();
  });

  it('passes only authenticated user and receipt ID when explicitly enabled in QA', async () => {
    process.env.ZFILES_DEPLOYMENT_SCOPE = 'qa';
    process.env.ZFILES_RECEIPT_ATTACHMENT_METADATA_QA_ENABLED = '1';
    service.list.mockResolvedValue([]);
    await expect(controller.list(req, 'receipt-a')).resolves.toEqual([]);
    expect(service.list).toHaveBeenCalledWith(
      'company-a',
      'actor-a',
      'receipt-a',
    );
  });

  it('retains JWT and management-only role guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      PurchaseReceiptAttachmentsController,
    ) as unknown[];
    expect(guards).toHaveLength(2);
    expect(
      Reflect.getMetadata('roles', PurchaseReceiptAttachmentsController),
    ).toEqual([UserRole.ADMIN, UserRole.MANAGER]);
  });
});
