import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

export const SUPPLIER_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const SUPPLIER_ATTACHMENT_MAX_PER_DOCUMENT = 10;
export const SUPPLIER_ATTACHMENT_MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;

type IncomingAttachment = {
  originalName: string;
  claimedMime: string;
  bytes: Buffer;
};

export type InspectedSupplierAttachment = {
  originalName: string;
  contentType: 'application/pdf' | 'image/jpeg';
  sizeBytes: number;
  sha256: string;
};

/**
 * Byte sniffing does not replace antivirus scanning, PDF sanitization,
 * malware policy, quotas or isolated object-storage verification.
 * This helper only supports the first strict validation gate.
 */
export function inspectSupplierAttachment(
  input: IncomingAttachment,
): InspectedSupplierAttachment {
  const { bytes, claimedMime } = input;
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length === 0 ||
    bytes.length > SUPPLIER_ATTACHMENT_MAX_BYTES
  ) {
    throw new BadRequestException('Tamaño de archivo inválido (máximo 10 MiB)');
  }

  const name = input.originalName.normalize('NFC').trim();
  if (
    !name ||
    Buffer.byteLength(name, 'utf8') > 255 ||
    /[\\/]/u.test(name) ||
    Array.from(name).some((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    }) ||
    name === '.' ||
    name === '..'
  ) {
    throw new BadRequestException('Nombre de archivo inválido');
  }

  // PDF: strict header and an end marker near the tail.
  const isPdf =
    bytes.length >= 12 &&
    bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) &&
    bytes
      .subarray(Math.max(0, bytes.length - 2048))
      .includes(Buffer.from('%%EOF'));

  // JPEG: SOI, byte after SOI, and EOI. No other image formats are accepted.
  const isJpeg =
    bytes.length >= 6 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9;

  let contentType: 'application/pdf' | 'image/jpeg';
  if (isPdf && !isJpeg) {
    contentType = 'application/pdf';
    if (!/\.pdf$/i.test(name)) {
      throw new BadRequestException('La extensión no coincide con el PDF');
    }
  } else if (isJpeg && !isPdf) {
    contentType = 'image/jpeg';
    if (!/\.(jpe?g)$/i.test(name)) {
      throw new BadRequestException('La extensión no coincide con el JPEG');
    }
  } else {
    throw new BadRequestException('Solo se admiten PDF y JPEG válidos');
  }

  if (claimedMime !== contentType) {
    throw new BadRequestException(
      'El MIME declarado no coincide con el archivo',
    );
  }

  return {
    originalName: name,
    contentType,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
