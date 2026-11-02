import { BadRequestException } from '@nestjs/common';
import {
  inspectSupplierAttachment,
  SUPPLIER_ATTACHMENT_MAX_BYTES,
} from './supplier-document-attachment-validation';

const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]);

describe('supplier document attachment validation', () => {
  it('detects a valid PDF and computes its SHA-256 digest', () => {
    expect(
      inspectSupplierAttachment({
        originalName: ' factura.pdf ',
        claimedMime: 'application/pdf',
        bytes: pdf,
      }),
    ).toMatchObject({
      originalName: 'factura.pdf',
      contentType: 'application/pdf',
      sizeBytes: pdf.length,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
    });
  });

  it('accepts a valid JPEG and rejects a misleading filename', () => {
    expect(
      inspectSupplierAttachment({
        originalName: 'evidencia.jpeg',
        claimedMime: 'image/jpeg',
        bytes: jpeg,
      }).contentType,
    ).toBe('image/jpeg');
    expect(() =>
      inspectSupplierAttachment({
        originalName: 'factura.pdf',
        claimedMime: 'application/pdf',
        bytes: jpeg,
      }),
    ).toThrow(BadRequestException);
  });

  it('does not trust declared MIME or extension', () => {
    expect(() =>
      inspectSupplierAttachment({
        originalName: 'invoice.pdf',
        claimedMime: 'application/pdf',
        bytes: Buffer.from('not a pdf'),
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      inspectSupplierAttachment({
        originalName: 'invoice.pdf',
        claimedMime: 'image/jpeg',
        bytes: pdf,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects empty and oversized buffers', () => {
    for (const bytes of [
      Buffer.alloc(0),
      Buffer.alloc(SUPPLIER_ATTACHMENT_MAX_BYTES + 1),
    ]) {
      expect(() =>
        inspectSupplierAttachment({
          originalName: 'invoice.pdf',
          claimedMime: 'application/pdf',
          bytes,
        }),
      ).toThrow(BadRequestException);
    }
  });

  it.each(['../escape.pdf', '..\\escape.pdf', 'a\n.pdf', '.'])(
    'rejects unsafe name %s',
    (originalName) => {
      expect(() =>
        inspectSupplierAttachment({
          originalName,
          claimedMime: 'application/pdf',
          bytes: pdf,
        }),
      ).toThrow(BadRequestException);
    },
  );

  it('rejects a truncated PDF even when it has a correct header', () => {
    expect(() =>
      inspectSupplierAttachment({
        originalName: 'truncated.pdf',
        claimedMime: 'application/pdf',
        bytes: Buffer.from('%PDF-1.7\n...'),
      }),
    ).toThrow(BadRequestException);
  });
});
