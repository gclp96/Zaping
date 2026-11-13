import { BadRequestException } from '@nestjs/common';
import { validateIncomingFile } from './file-validation';

const pdf = Buffer.from('%PDF-1.7\nDocumento de prueba\n%%EOF\n');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0xff, 0xd9]);
const input = (buffer: Buffer, originalname: string, mimetype: string) => ({
  buffer,
  size: buffer.length,
  originalname,
  mimetype,
});

describe('Zaping Files file validation', () => {
  it('accepts PDF content and returns a checksum', () => {
    const checked = validateIncomingFile(
      input(pdf, 'factura.pdf', 'application/pdf'),
    );
    expect(checked.contentType).toBe('application/pdf');
    expect(checked.extension).toBe('pdf');
    expect(checked.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts JPEG content and canonicalizes its extension', () => {
    const checked = validateIncomingFile(
      input(jpeg, 'foto.JPEG', 'image/jpeg'),
    );
    expect(checked.contentType).toBe('image/jpeg');
    expect(checked.extension).toBe('jpg');
  });

  it('rejects HTML disguised as PDF', () => {
    expect(() =>
      validateIncomingFile(
        input(
          Buffer.from('<html>malicious</html>'),
          'doc.pdf',
          'application/pdf',
        ),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects mismatched MIME and unsafe filenames', () => {
    expect(() =>
      validateIncomingFile(input(pdf, 'doc.pdf', 'image/jpeg')),
    ).toThrow(BadRequestException);
    expect(() =>
      validateIncomingFile(input(pdf, 'doc\n.pdf', 'application/pdf')),
    ).toThrow(BadRequestException);
  });

  it('rejects empty and oversized payloads', () => {
    expect(() =>
      validateIncomingFile(
        input(Buffer.alloc(0), 'doc.pdf', 'application/pdf'),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateIncomingFile(
        input(Buffer.alloc(10 * 1024 * 1024 + 1), 'doc.pdf', 'application/pdf'),
      ),
    ).toThrow(BadRequestException);
  });
});
