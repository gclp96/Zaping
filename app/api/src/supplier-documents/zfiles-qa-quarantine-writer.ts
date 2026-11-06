import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { CloudflareR2QuarantineWriter } from './cloudflare-r2-quarantine-write';
import type { ValidatedQuarantinePayload } from './cloudflare-r2-quarantine-payload';

export abstract class QuarantineUploadWriterPort {
  abstract put(
    companyId: string,
    key: string,
    payload: ValidatedQuarantinePayload,
  ): Promise<void>;
}

@Injectable()
export class UnconfiguredQuarantineWriter extends QuarantineUploadWriterPort {
  put(): Promise<void> {
    return Promise.reject(
      new ServiceUnavailableException('Carga a cuarentena no configurada'),
    );
  }
}

/**
 * QA-only writer identity. Never accepts an arbitrary target bucket or URL.
 * A separately scoped Object Read & Write R2 QA token must be injected using
 * the deployment secret manager, not source code or a client request.
 */
export function createQaQuarantineWriter(): QuarantineUploadWriterPort {
  if (
    process.env.ZFILES_DEPLOYMENT_SCOPE !== 'qa' ||
    process.env.ZFILES_QA_RESERVATIONS_ENABLED !== '1' ||
    process.env.ZFILES_QA_BINARY_UPLOAD_ENABLED !== '1'
  ) {
    return new UnconfiguredQuarantineWriter();
  }
  const account = process.env.ZFILES_QA_R2_ACCOUNT_ID ?? '';
  const keyId = process.env.ZFILES_QA_R2_WRITE_ACCESS_KEY_ID ?? '';
  const secret = process.env.ZFILES_QA_R2_WRITE_SECRET_ACCESS_KEY ?? '';
  if (
    !/^[0-9a-f]{32}$/.test(account) ||
    !/^[A-Za-z0-9]{12,200}$/.test(keyId) ||
    secret.length < 16 ||
    secret.length > 200 ||
    /[\r\n]/.test(secret)
  ) {
    return new UnconfiguredQuarantineWriter();
  }
  const client = new S3Client({
    region: 'auto',
    forcePathStyle: true,
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: keyId, secretAccessKey: secret },
    maxAttempts: 1,
  });
  // The account token must be scoped ONLY to the QA quarantine bucket.
  return new CloudflareR2QuarantineWriter(client, 'zaping-quarantine-qa');
}
