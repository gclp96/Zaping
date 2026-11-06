import { Readable } from 'node:stream';
import { BadRequestException } from '@nestjs/common';
import { consumeQuarantineUpload } from './cloudflare-r2-quarantine-payload';
import { SUPPLIER_ATTACHMENT_MAX_BYTES } from './supplier-document-attachment-validation';

const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]);

describe('bounded R2 quarantine upload', () => {
  it('validates PDF and computes actual bytes and digest before staging', async () => {
    const uploaded = await consumeQuarantineUpload(
      Readable.from([pdf.subarray(0, 5), pdf.subarray(5)]),
      'evidencia.pdf',
      'application/pdf',
      pdf.length,
    );
    expect(uploaded.bytes).toEqual(pdf);
    expect(uploaded.metadata).toMatchObject({
      originalName: 'evidencia.pdf',
      contentType: 'application/pdf',
      sizeBytes: pdf.length,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
    });
  });

  it('accepts JPEG but rejects spoofed MIME and extension', async () => {
    const valid = await consumeQuarantineUpload(
      Readable.from([jpeg]),
      'recepcion.jpeg',
      'image/jpeg',
    );
    expect(valid.metadata.contentType).toBe('image/jpeg');

    await expect(
      consumeQuarantineUpload(
        Readable.from([jpeg]),
        'falso.pdf',
        'application/pdf',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a declared length outside the allowed range', async () => {
    for (const size of [0, -1, 1.5, SUPPLIER_ATTACHMENT_MAX_BYTES + 1]) {
      await expect(
        consumeQuarantineUpload(
          Readable.from([pdf]),
          'evidencia.pdf',
          'application/pdf',
          size,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rejects incomplete content without returning a partially validated file', async () => {
    await expect(
      consumeQuarantineUpload(
        Readable.from([pdf.subarray(0, 6)]),
        'evidencia.pdf',
        'application/pdf',
        pdf.length,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized streaming content before allocating a single huge buffer', async () => {
    const source = Readable.from([
      Buffer.alloc(SUPPLIER_ATTACHMENT_MAX_BYTES),
      Buffer.from('overflow'),
    ]);
    await expect(
      consumeQuarantineUpload(source, 'evidencia.pdf', 'application/pdf'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(source.destroyed).toBe(true);
  });

  it('rejects empty, text-mode and unsafe-name inputs', async () => {
    await expect(
      consumeQuarantineUpload(
        Readable.from([]),
        'evidencia.pdf',
        'application/pdf',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      consumeQuarantineUpload(
        Readable.from(['not a binary stream']),
        'evidencia.pdf',
        'application/pdf',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      consumeQuarantineUpload(
        Readable.from([pdf]),
        '../secreto.pdf',
        'application/pdf',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
