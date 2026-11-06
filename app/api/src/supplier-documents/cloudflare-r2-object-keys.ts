import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PRIVATE_KEY = new RegExp(`^private/(${UUID})/(${UUID})/(${UUID})$`, 'i');
const QUARANTINE_KEY = new RegExp(
  `^quarantine/(${UUID})/(${UUID})/(${UUID})$`,
  'i',
);

function assertUuid(value: string): void {
  if (!new RegExp(`^${UUID}$`, 'i').test(value)) {
    throw new BadRequestException('Identificador interno inválido');
  }
}

/**
 * File IDs and all object paths come from the server; never use an uploaded
 * filename, document folio, query parameter or URL as an object key.
 */
export function createR2ObjectKeys(
  companyId: string,
  documentId: string,
): { attachmentId: string; quarantineKey: string; privateKey: string } {
  assertUuid(companyId);
  assertUuid(documentId);
  const attachmentId = randomUUID();
  const suffix = `${companyId.toLowerCase()}/${documentId.toLowerCase()}/${attachmentId}`;
  return {
    attachmentId,
    quarantineKey: `quarantine/${suffix}`,
    privateKey: `private/${suffix}`,
  };
}

/**
 * Internal quarantine scope. This must never be used by the approved-object
 * download provider.
 */
export function requireTenantQuarantineR2Key(
  key: string,
  companyId: string,
): string {
  assertUuid(companyId);
  const match = QUARANTINE_KEY.exec(key);
  if (!match || match[1].toLowerCase() !== companyId.toLowerCase()) {
    throw new BadRequestException('Clave de cuarentena inválida');
  }
  return key;
}

export function requireTenantPrivateR2Key(
  key: string,
  companyId: string,
): string {
  assertUuid(companyId);
  const match = PRIVATE_KEY.exec(key);
  if (!match || match[1].toLowerCase() !== companyId.toLowerCase()) {
    throw new BadRequestException('Clave privada de adjunto inválida');
  }
  return key;
}
