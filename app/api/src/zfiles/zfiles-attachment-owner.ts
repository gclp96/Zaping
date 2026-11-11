import { randomUUID } from 'node:crypto';

/**
 * Discriminated ownership contract for Zaping Files.
 *
 * This helper does not authorize the owner. NestJS must independently
 * validate Company, business entity and actor privileges in PostgreSQL
 * before reserving or reading any attachment.
 */
export type ZfilesAttachmentOwner =
  | {
      kind: 'SUPPLIER_DOCUMENT';
      companyId: string;
      documentId: string;
    }
  | {
      kind: 'PURCHASE_RECEIPT';
      companyId: string;
      receiptId: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function requireCanonicalUuid(value: string, field: string): void {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`Invalid Zaping Files ${field}`);
  }
}

/**
 * Generates an opaque quarantine key using only validated, server-owned IDs.
 * Its 4-part layout reuses the existing QA quarantine convention:
 * quarantine/<companyId>/<ownerId>/<attachmentId>.
 *
 * The owner kind belongs in relational metadata and must be checked there;
 * storage-key knowledge is never evidence of access permission.
 */
export function createZfilesQuarantineKey(
  owner: ZfilesAttachmentOwner,
  attachmentId: string = randomUUID(),
): string {
  if (!owner || typeof owner !== 'object') {
    throw new Error('Invalid Zaping Files owner');
  }

  requireCanonicalUuid(owner.companyId, 'companyId');

  let ownerId: string;
  switch (owner.kind) {
    case 'SUPPLIER_DOCUMENT':
      ownerId = owner.documentId;
      break;
    case 'PURCHASE_RECEIPT':
      ownerId = owner.receiptId;
      break;
    default:
      throw new Error('Unsupported Zaping Files owner kind');
  }

  requireCanonicalUuid(ownerId, 'ownerId');
  requireCanonicalUuid(attachmentId, 'attachmentId');

  return `quarantine/${owner.companyId}/${ownerId}/${attachmentId}`;
}
