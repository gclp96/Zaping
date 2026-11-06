import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { SUPPLIER_ATTACHMENT_MAX_BYTES } from './supplier-document-attachment-validation';

export async function consumeAndVerifyPrivateAttachment(
  source: Readable,
  declaredBytes: number,
  expectedSha256: string,
): Promise<Buffer> {
  if (
    !Number.isSafeInteger(declaredBytes) ||
    declaredBytes < 1 ||
    declaredBytes > SUPPLIER_ATTACHMENT_MAX_BYTES ||
    !/^[a-f0-9]{64}$/.test(expectedSha256)
  ) {
    throw new ConflictException('Metadatos de archivo inválidos');
  }

  const chunks: Buffer[] = [];
  const digest = createHash('sha256');
  let total = 0;

  try {
    for await (const rawChunk of source) {
      const chunk = Buffer.from(rawChunk as Uint8Array);
      total += chunk.length;
      if (total > declaredBytes || total > SUPPLIER_ATTACHMENT_MAX_BYTES) {
        throw new ConflictException(
          'El tamaño del objeto privado es incorrecto',
        );
      }
      digest.update(chunk);
      chunks.push(chunk);
    }
  } finally {
    // Close the upstream stream both on success and error. Do not leave an
    // open connection after a size violation or a storage interruption.
    source.destroy();
  }

  if (total !== declaredBytes || digest.digest('hex') !== expectedSha256) {
    throw new ConflictException('La integridad del objeto privado no coincide');
  }
  return Buffer.concat(chunks, total);
}

export function safeAttachmentDisposition(
  originalName: string,
  contentType: 'application/pdf' | 'image/jpeg',
): string {
  const fallback =
    contentType === 'application/pdf' ? 'attachment.pdf' : 'attachment.jpg';
  // RFC 5987 filename* is percent-encoded; use fixed ASCII fallback and
  // explicitly remove control characters even for historical metadata.
  const cleaned = Array.from(originalName)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127 && char !== '/' && char !== '\\';
    })
    .join('')
    .trim();
  const safeName = Array.from(cleaned).slice(0, 120).join('') || fallback;
  const encodedName = encodeURIComponent(safeName).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodedName}`;
}
