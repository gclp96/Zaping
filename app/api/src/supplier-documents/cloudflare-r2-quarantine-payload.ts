import { BadRequestException } from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  inspectSupplierAttachment,
  SUPPLIER_ATTACHMENT_MAX_BYTES,
  type InspectedSupplierAttachment,
} from './supplier-document-attachment-validation';

export type ValidatedQuarantinePayload = {
  metadata: InspectedSupplierAttachment;
  bytes: Buffer;
};

/**
 * Bound the memory allocation while reading, not after a file-upload
 * middleware has already buffered an arbitrarily large request.
 *
 * No file is written or registered until the entire body passes the
 * existing PDF/JPEG signature, claimed MIME, extension and SHA-256 checks.
 * Multipart parsing / request size enforcement must be added separately
 * at the HTTP entry point before this can be exposed.
 */
export async function consumeQuarantineUpload(
  source: Readable,
  originalName: string,
  claimedMime: string,
  declaredLength?: number,
): Promise<ValidatedQuarantinePayload> {
  if (
    declaredLength !== undefined &&
    (!Number.isSafeInteger(declaredLength) ||
      declaredLength < 1 ||
      declaredLength > SUPPLIER_ATTACHMENT_MAX_BYTES)
  ) {
    throw new BadRequestException('Longitud declarada de archivo inválida');
  }

  let total = 0;
  const chunks: Buffer[] = [];
  try {
    for await (const raw of source) {
      if (!(raw instanceof Uint8Array)) {
        throw new BadRequestException('Tipo de contenido de archivo inválido');
      }
      const chunk = Buffer.from(raw);
      total += chunk.length;
      if (total > SUPPLIER_ATTACHMENT_MAX_BYTES) {
        throw new BadRequestException('Archivo excede 10 MiB');
      }
      chunks.push(chunk);
    }
  } finally {
    source.destroy();
  }
  if (!total || (declaredLength !== undefined && total !== declaredLength)) {
    throw new BadRequestException('Longitud del archivo incompleta o inválida');
  }

  const bytes = Buffer.concat(chunks, total);
  const metadata = inspectSupplierAttachment({
    originalName,
    claimedMime,
    bytes,
  });
  return { metadata, bytes };
}
