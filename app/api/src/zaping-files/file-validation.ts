import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FILE_MAX_PER_RECEIPT = 5;

export interface IncomingFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface ValidatedFile {
  bytes: Buffer;
  originalName: string;
  contentType: 'application/pdf' | 'image/jpeg';
  extension: 'pdf' | 'jpg';
  sizeBytes: number;
  sha256: string;
}

export function validateIncomingFile(file: IncomingFile | undefined): ValidatedFile {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException('Selecciona un archivo PDF o JPEG');
  }
  if (
    file.size === 0 ||
    file.size > FILE_MAX_BYTES ||
    file.size !== file.buffer.length
  ) {
    throw new BadRequestException('El archivo debe tener entre 1 byte y 10 MiB');
  }

  const name = (file.originalname ?? '')
    .split(/[\\/]/)
    .pop()
    ?.normalize('NFC');
  if (
    !name ||
    name.length > 255 ||
    /[\x00-\x1f\x7f]/.test(name) ||
    name === '.' ||
    name === '..'
  ) {
    throw new BadRequestException('Nombre de archivo inválido');
  }

  const ext = name.split('.').pop()?.toLowerCase();
  const pdf =
    ext === 'pdf' &&
    file.mimetype === 'application/pdf' &&
    file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-')) &&
    file.buffer.subarray(-1024).includes(Buffer.from('%%EOF'));
  const jpeg =
    (ext === 'jpg' || ext === 'jpeg') &&
    file.mimetype === 'image/jpeg' &&
    file.buffer.length >= 4 &&
    file.buffer[0] === 0xff &&
    file.buffer[1] === 0xd8 &&
    file.buffer[2] === 0xff &&
    file.buffer[file.buffer.length - 2] === 0xff &&
    file.buffer[file.buffer.length - 1] === 0xd9;

  if (!pdf && !jpeg) {
    throw new BadRequestException('Contenido o tipo de archivo no permitido');
  }

  return {
    bytes: file.buffer,
    originalName: name,
    contentType: pdf ? 'application/pdf' : 'image/jpeg',
    extension: pdf ? 'pdf' : 'jpg',
    sizeBytes: file.size,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
  };
}
