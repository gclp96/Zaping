import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import {
  createR2ObjectKeys,
  requireTenantPrivateR2Key,
} from './cloudflare-r2-object-keys';

describe('Cloudflare R2 opaque object paths', () => {
  const companyId = randomUUID();
  const documentId = randomUUID();

  it('uses server-generated UUIDs and separates private from quarantine', () => {
    const first = createR2ObjectKeys(companyId, documentId);
    const second = createR2ObjectKeys(companyId, documentId);
    expect(first.attachmentId).not.toBe(second.attachmentId);
    expect(first.quarantineKey).toBe(
      `quarantine/${companyId}/${documentId}/${first.attachmentId}`,
    );
    expect(first.privateKey).toBe(
      `private/${companyId}/${documentId}/${first.attachmentId}`,
    );
    expect(requireTenantPrivateR2Key(first.privateKey, companyId)).toBe(
      first.privateKey,
    );
  });

  it('does not allow access to another Company or quarantine key', () => {
    const keys = createR2ObjectKeys(companyId, documentId);
    for (const [key, tenant] of [
      [keys.privateKey, randomUUID()],
      [keys.quarantineKey, companyId],
      ['https://example.com/key', companyId],
      [`private/${companyId}/../bad`, companyId],
      ['private/not-an-id/file', companyId],
    ]) {
      expect(() => requireTenantPrivateR2Key(key, tenant)).toThrow(
        BadRequestException,
      );
    }
  });

  it('rejects user-provided non-UUID company or document IDs', () => {
    expect(() => createR2ObjectKeys('../other', documentId)).toThrow(
      BadRequestException,
    );
    expect(() => createR2ObjectKeys(companyId, 'not-a-document')).toThrow(
      BadRequestException,
    );
  });
});
