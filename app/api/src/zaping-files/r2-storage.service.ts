import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { FILE_MAX_BYTES } from './file-validation';

@Injectable()
export class R2StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string | undefined;

  constructor(config: ConfigService) {
    const accountId = config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucket = config.get<string>('R2_BUCKET');

    this.client =
      accountId && accessKeyId && secretAccessKey && this.bucket
        ? new S3Client({
            region: 'auto',
            endpoint: 'https://' + accountId + '.r2.cloudflarestorage.com',
            forcePathStyle: true,
            // R2 does not implement every optional AWS flexible checksum header.
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }

  private requireClient() {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException(
        'Cloudflare R2 no está configurado',
      );
    }
    return { client: this.client, bucket: this.bucket };
  }

  async upload(
    objectKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const { client, bucket } = this.requireClient();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: body,
          ContentLength: body.length,
          ContentType: contentType,
          ContentDisposition: 'attachment',
          CacheControl: 'private, no-store',
        }),
      );
    } catch {
      throw new ServiceUnavailableException(
        'No fue posible almacenar el archivo',
      );
    }
  }

  async download(
    objectKey: string,
    expectedSize: number,
    expectedHash: string,
  ): Promise<Buffer> {
    const { client, bucket } = this.requireClient();
    try {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
      if (
        !result.Body ||
        result.ContentLength !== expectedSize ||
        expectedSize <= 0 ||
        expectedSize > FILE_MAX_BYTES
      ) {
        throw new Error('Invalid object size');
      }
      const buffer = Buffer.from(await result.Body.transformToByteArray());
      if (
        buffer.length !== expectedSize ||
        createHash('sha256').update(buffer).digest('hex') !== expectedHash
      ) {
        throw new Error('Object integrity mismatch');
      }
      return buffer;
    } catch {
      throw new ServiceUnavailableException(
        'Archivo no disponible o integridad inválida',
      );
    }
  }

  // Compensation for database failures; deletion of accepted files is deferred.
  async discardUnlinkedObject(objectKey: string): Promise<void> {
    const { client, bucket } = this.requireClient();
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
  }
}
