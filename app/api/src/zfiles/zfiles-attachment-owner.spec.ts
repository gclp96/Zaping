import { createZfilesQuarantineKey } from './zfiles-attachment-owner';
import type { ZfilesAttachmentOwner } from './zfiles-attachment-owner';

describe('Zaping Files ownership and quarantine object key', () => {
  const companyId = '11111111-1111-4111-8111-111111111111';
  const documentId = '22222222-2222-4222-8222-222222222222';
  const receiptId = '33333333-3333-4333-8333-333333333333';
  const attachmentId = '44444444-4444-4444-8444-444444444444';

  it('reuses the quarantine key convention for a supplier document', () => {
    expect(
      createZfilesQuarantineKey(
        { kind: 'SUPPLIER_DOCUMENT', companyId, documentId },
        attachmentId,
      ),
    ).toBe(`quarantine/${companyId}/${documentId}/${attachmentId}`);
  });

  it('supports a receipt-owned file without requiring a supplier document', () => {
    expect(
      createZfilesQuarantineKey(
        { kind: 'PURCHASE_RECEIPT', companyId, receiptId },
        attachmentId,
      ),
    ).toBe(`quarantine/${companyId}/${receiptId}/${attachmentId}`);
  });

  it('rejects a cross-company-looking path or malformed entity ID', () => {
    expect(() =>
      createZfilesQuarantineKey(
        { kind: 'PURCHASE_RECEIPT', companyId: '../other', receiptId },
        attachmentId,
      ),
    ).toThrow('Invalid Zaping Files companyId');

    expect(() =>
      createZfilesQuarantineKey(
        { kind: 'SUPPLIER_DOCUMENT', companyId, documentId: 'x/y' },
        attachmentId,
      ),
    ).toThrow('Invalid Zaping Files ownerId');
  });

  it('rejects an invalid attachment ID', () => {
    expect(() =>
      createZfilesQuarantineKey(
        { kind: 'PURCHASE_RECEIPT', companyId, receiptId },
        '../unexpected',
      ),
    ).toThrow('Invalid Zaping Files attachmentId');
  });

  it('rejects unrecognized business entity types', () => {
    const unexpected = {
      kind: 'PURCHASE_ORDER',
      companyId,
      receiptId,
    } as unknown as ZfilesAttachmentOwner;

    expect(() => createZfilesQuarantineKey(unexpected, attachmentId)).toThrow(
      'Unsupported Zaping Files owner kind',
    );
  });

  it('creates a new opaque attachment ID when not supplied', () => {
    const key = createZfilesQuarantineKey({
      kind: 'PURCHASE_RECEIPT',
      companyId,
      receiptId,
    });
    expect(key).toMatch(
      new RegExp(`^quarantine/${companyId}/${receiptId}/[0-9a-f-]{36}$`),
    );
  });
});
