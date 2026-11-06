import { Readable } from 'node:stream';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { requireTenantQuarantineR2Key } from './cloudflare-r2-object-keys';
import { consumeAndVerifyPrivateAttachment } from './supplier-document-attachment-download';

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
      await consumeAndVerifyPrivateAttachment(result.Body, sizeBytes, sha256);
    } catch {
      // A missing object, network timeout and wrong digest all remain
      // uncertain, and must NEVER silently release the quota reservation.
      throw new ServiceUnavailableException(
        'Verificación de cuarentena no confirmada',
      );
    }
  }
}
