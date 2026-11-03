import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { inspectSupplierAttachment } from '../supplier-documents/supplier-document-attachment-validation';
import { verifyZfilesR2QaBody } from './zfiles-r2-qa-read';

const JURISDICTIONS = new Set(['default', 'eu', 'us', 'fedramp']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ZfilesQuarantineQaConfig = {
  bucket: 'zaping-quarantine-qa';
  endpoint: string;
  region: 'auto';
};

export type ZfilesQuarantineQaPhase = 'prepare' | 'put' | 'get' | 'verify';

const SAFE_QA_CODES = new Set([
  'AccessDenied',
  'BadDigest',
  'CredentialsProviderError',
  'Forbidden',
  'InvalidAccessKeyId',
  'InvalidArgument',
  'InvalidDigest',
  'InvalidRequest',
  'NoSuchBucket',
  'NoSuchKey',
  'NotImplemented',
  'PreconditionFailed',
  'RequestTimeout',
  'SignatureDoesNotMatch',
  'TimeoutError',
]);

/** Expose only an allowlisted S3 code and numeric status, never SDK messages. */
export function summarizeZfilesQuarantineQaError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UNCLASSIFIED';
  const raw = error as { name?: unknown; $metadata?: unknown };
  const code =
    typeof raw.name === 'string' && SAFE_QA_CODES.has(raw.name)
      ? raw.name
      : 'UNCLASSIFIED';
  const metadata = raw.$metadata as { httpStatusCode?: unknown } | undefined;
  const status = metadata?.httpStatusCode;
  const safeStatus =
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
      ? ` HTTP ${status}`
      : '';
  return code + safeStatus;
}

export function requireZfilesQuarantineQaConfig(
  env: NodeJS.ProcessEnv,
): ZfilesQuarantineQaConfig {
  if (env.RUN_ZFILES_R2_QUARANTINE_QA_WRITE !== '1') {
    throw new Error('Quarantine QA write requires explicit opt-in');
  }
  if (env.CI === 'true' || env.GITHUB_ACTIONS === 'true') {
    throw new Error('Quarantine QA write is forbidden in CI');
  }
  if (
    env.R2_QUARANTINE_BUCKET !== 'zaping-quarantine-qa' ||
    env.R2_PRIVATE_BUCKET !== 'zaping-private-qa'
  ) {
    throw new Error('Quarantine QA requires exact isolated bucket names');
  }
  const accountId = env.R2_ACCOUNT_ID ?? '';
  const jurisdiction = env.R2_JURISDICTION ?? 'default';
  if (!/^[0-9a-f]{32}$/.test(accountId)) {
    throw new Error('Invalid QA R2 account ID');
  }
  if (!JURISDICTIONS.has(jurisdiction)) {
    throw new Error('Invalid QA R2 jurisdiction');
  }
  const prefix = jurisdiction === 'default' ? '' : jurisdiction + '.';
  return {
    bucket: 'zaping-quarantine-qa',
    endpoint:
      'https://' + accountId + '.' + prefix + 'r2.cloudflarestorage.com',
    region: 'auto',
  };
}

/** Isolated local QA client; never a NestJS provider or user upload route. */
export function createZfilesQuarantineQaClient(env: NodeJS.ProcessEnv): {
  client: S3Client;
  config: ZfilesQuarantineQaConfig;
} {
  const config = requireZfilesQuarantineQaConfig(env);
  const accessKeyId = env.R2_QUARANTINE_WRITE_ACCESS_KEY_ID ?? '';
  const secretAccessKey = env.R2_QUARANTINE_WRITE_SECRET_ACCESS_KEY ?? '';
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Quarantine QA scoped S3 credentials are missing');
  }
  return {
    config,
    client: new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 1,
      requestChecksumCalculation: 'WHEN_REQUIRED',
    }),
  };
}

export function createSyntheticQuarantinePdf(): {
  bytes: Buffer;
  key: string;
  sha256: string;
} {
  const companyId = randomUUID();
  const documentId = randomUUID();
  const attachmentId = randomUUID();
  const key = 'quarantine/' + companyId + '/' + documentId + '/' + attachmentId;
  const bytes = Buffer.from(
    '%PDF-1.4\n% ZAPING SYNTHETIC QA ' +
      randomUUID() +
      '\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
    'utf8',
  );
  const metadata = inspectSupplierAttachment({
    originalName: 'synthetic-qa.pdf',
    claimedMime: 'application/pdf',
    bytes,
  });
  return { bytes, key, sha256: metadata.sha256 };
}

/**
 * Writes one new synthetic PDF into the quarantine QA bucket and re-reads
 * exactly those bytes. Never deletes, copies, promotes or records availability.
 */
export async function writeAndVerifyQuarantineQaFixture(
  client: S3Client,
  config: ZfilesQuarantineQaConfig,
  onPhase?: (phase: ZfilesQuarantineQaPhase) => void,
): Promise<{ key: string; sizeBytes: number; sha256: string }> {
  if (config.bucket !== 'zaping-quarantine-qa') {
    throw new Error('QA write can only target the quarantine bucket');
  }
  onPhase?.('prepare');
  const fixture = createSyntheticQuarantinePdf();
  const keyParts = fixture.key.split('/');
  if (
    keyParts.length !== 4 ||
    keyParts[0] !== 'quarantine' ||
    !keyParts.slice(1).every((part) => UUID.test(part))
  ) {
    throw new Error('Invalid synthetic quarantine key');
  }
  const sizeBytes = fixture.bytes.byteLength;
  const contentMD5 = createHash('md5').update(fixture.bytes).digest('base64');

  // R2 evaluates If-None-Match: * atomically. Do not overwrite or retry
  // ambiguous writes. Content-MD5 detects transport corruption.
  onPhase?.('put');
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: fixture.key,
      Body: fixture.bytes,
      ContentType: 'application/pdf',
      ContentLength: sizeBytes,
      ContentMD5: contentMD5,
      IfNoneMatch: '*',
    }),
    { abortSignal: AbortSignal.timeout(10_000) },
  );

  onPhase?.('get');
  const result = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: fixture.key }),
    { abortSignal: AbortSignal.timeout(10_000) },
  );
  const body = result.Body;
  if (!(body instanceof Readable)) {
    throw new Error('Quarantine QA object response has no Node stream');
  }
  try {
    if (result.ContentLength !== sizeBytes) {
      throw new Error('Quarantine QA object length mismatch');
    }
    onPhase?.('verify');
    await verifyZfilesR2QaBody(body, {
      sizeBytes,
      sha256: fixture.sha256,
    });
  } finally {
    body.destroy();
  }
  return { key: fixture.key, sizeBytes, sha256: fixture.sha256 };
}
