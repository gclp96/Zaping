import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ConflictException } from '@nestjs/common';
import {
  consumeAndVerifyPrivateAttachment,
  safeAttachmentDisposition,
} from './supplier-document-attachment-download';
import { SUPPLIER_ATTACHMENT_MAX_BYTES } from './supplier-document-attachment-validation';

describe('private supplier attachment download boundary', () => {
  const bytes = Buffer.from('%PDF-1.7\nexample\n%%EOF\n');
  const digest = createHash('sha256').update(bytes).digest('hex');

  it('buffers and hashes every byte before releasing the file', async () => {
    await expect(
      consumeAndVerifyPrivateAttachment(
        Readable.from([bytes.subarray(0, 6), bytes.subarray(6)]),
        bytes.length,
        digest,
      ),
    ).resolves.toEqual(bytes);
  });

  it('rejects a changed object even when the content length still matches', async () => {
    const tampered = Buffer.from(bytes);
    tampered[7] = 0x58;
    await expect(
      consumeAndVerifyPrivateAttachment(
        Readable.from([tampered]),
        bytes.length,
        digest,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects incomplete or larger objects without returning partial data', async () => {
    await expect(
      consumeAndVerifyPrivateAttachment(
        Readable.from([bytes.subarray(0, 4)]),
        bytes.length,
        digest,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      consumeAndVerifyPrivateAttachment(
        Readable.from([bytes, Buffer.from('excess')]),
        bytes.length,
        digest,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects corrupt metadata and an oversized declared length', async () => {
    for (const [size, checksum] of [
      [0, digest],
      [SUPPLIER_ATTACHMENT_MAX_BYTES + 1, digest],
      [bytes.length, 'bad-checksum'],
    ] as const) {
      await expect(
        consumeAndVerifyPrivateAttachment(
          Readable.from([bytes]),
          size,
          checksum,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('prevents response header injection and always forces download', () => {
    const disposition = safeAttachmentDisposition(
      'evil\r\nContent-Type: text/html.pdf',
      'application/pdf',
    );
    expect(disposition).toMatch(/^attachment; filename="attachment\.pdf"/);
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(safeAttachmentDisposition('cámara.jpg', 'image/jpeg')).toContain(
      'c%C3%A1mara.jpg',
    );
  });
});
