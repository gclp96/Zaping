import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { requireTenantQuarantineR2Key } from './cloudflare-r2-object-keys';

/** Internal worker-only boundary. Never exposed to a controller or user. */
export abstract class QuarantineObjectVerifier {
  abstract verify(
    companyId: string,
    key: string,
    sizeBytes: number,
    sha256: string,
  ): Promise<void>;
}

/**
 * Real R2 verifier for a future isolated worker.
 * Credentials must be scoped to quarantine bucket ONLY. This class is not
 * registered as a Nest provider; no R2 secrets or network in current runtime.
 */
export class CloudflareR2QuarantineVerifier extends QuarantineObjectVerifier {
  constructor(
    private readonly client: S3Client,
    private readonly quarantineBucket: string,
  ) {
    super();
    if (!/^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/.test(quarantineBucket)) {
      throw new BadRequestException('Bucket de cuarentena inválido');
    }
  }

  async verify(
    companyId: string,
    key: string,
    sizeBytes: number,
    sha256: string,
  ): Promise<void> {
    const scopedKey = requireTenantQuarantineR2Key(key, companyId);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.quarantineBucket,
          Key: scopedKey,
        }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
      if (!(result.Body instanceof Readable)) {
        throw new Error('R2_QUARANTINE_NON_STREAM');
      }
      // A complete, size-limited GET + digest check; ETag is NOT SHA-256.
      // This helper destroys the upstream stream on error or mismatch.
      if (
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 1 ||
        sizeBytes > 10 * 1024 * 1024 ||
        !/^[0-9a-f]{64}$/.test(sha256)
      ) {
        result.Body.destroy();
        throw new Error('Invalid quarantine metadata');
      }
      let seen = 0;
      const digest = createHash('sha256');
      try {
        for await (const raw of result.Body) {
          const bytes = Buffer.from(raw as Uint8Array);
          seen += bytes.length;
          if (seen > sizeBytes) {
            throw new Error('Oversized quarantine object');
          }
          digest.update(bytes);
        }
      } finally {
        result.Body.destroy();
      }
      if (seen !== sizeBytes || digest.digest('hex') !== sha256) {
        throw new Error('Quarantine integrity mismatch');
      }
    } catch {
      // A missing object, network timeout and wrong digest all remain
      // uncertain, and must NEVER silently release the quota reservation.
      throw new ServiceUnavailableException(
        'Verificación de cuarentena no confirmada',
      );
    }
  }
}
