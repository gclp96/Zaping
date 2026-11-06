import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { SUPPLIER_ATTACHMENT_MAX_BYTES } from './supplier-document-attachment-validation';
import { requireTenantQuarantineR2Key } from './cloudflare-r2-object-keys';
import type { ValidatedQuarantinePayload } from './cloudflare-r2-quarantine-payload';

/**
 * Internal-only quarantine writer. Its S3Client must use a separate,
 * bucket-scoped Object Read & Write token, never the private-bucket read token.
 *
 * This adapter is intentionally NOT wired into a controller/provider.
 * No database record, scan approval or download permission is created here.
 */
export class CloudflareR2QuarantineWriter {
  constructor(
    private readonly client: S3Client,
    private readonly quarantineBucket: string,
  ) {
    if (!/^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/.test(quarantineBucket)) {
      throw new BadRequestException('Bucket de cuarentena inválido');
    }
  }

  async put(
    companyId: string,
    key: string,
    payload: ValidatedQuarantinePayload,
  ): Promise<void> {
    const scopedKey = requireTenantQuarantineR2Key(key, companyId);
    const { metadata, bytes } = payload;
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.length < 1 ||
      bytes.length > SUPPLIER_ATTACHMENT_MAX_BYTES ||
      metadata.sizeBytes !== bytes.length ||
      !/^[a-f0-9]{64}$/.test(metadata.sha256) ||
      createHash('sha256').update(bytes).digest('hex') !== metadata.sha256 ||
      !['application/pdf', 'image/jpeg'].includes(metadata.contentType)
    ) {
      throw new BadRequestException('Integridad de carga inválida');
    }

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.quarantineBucket,
          Key: scopedKey,
          Body: bytes,
          ContentType: metadata.contentType,
          ContentLength: bytes.length,
          // R2 evaluates create-once conditions atomically. Never overwrite
          // an existing quarantine object on UUID collisions or retries.
          IfNoneMatch: '*',
          CacheControl: 'private, no-store',
        }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
    } catch {
      // Provider exceptions can contain bucket names, keys and request data.
      // An ambiguous network failure can still have committed the object.
      // Later orchestration must reconcile before retrying the same key.
      throw new ServiceUnavailableException('Carga a cuarentena no confirmada');
    }
  }
}
