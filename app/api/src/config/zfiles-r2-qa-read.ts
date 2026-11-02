import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  requireZfilesR2QaFixture,
  type ZfilesR2QaFixture,
} from './zfiles-r2-qa-policy';
import { SUPPLIER_ATTACHMENT_MAX_BYTES } from '../supplier-documents/supplier-document-attachment-validation';

/**
 * QA-only R2 S3 client. No Nest provider or HTTP route imports this module.
 * Credentials are supplied explicitly; never use the default AWS provider chain.
 */
export function createZfilesR2QaReadClient(
  env: NodeJS.ProcessEnv,
): { client: S3Client; fixture: ZfilesR2QaFixture } {
  const fixture = requireZfilesR2QaFixture(env);
  const accessKeyId = env.R2_READ_ACCESS_KEY_ID ?? '';
  const secretAccessKey = env.R2_READ_SECRET_ACCESS_KEY ?? '';
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('R2 QA Object Read credentials are missing');
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: fixture.endpoint,
    forcePathStyle: true,
    maxAttempts: 2,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, fixture };
}

/** Verify an exact, bounded synthetic object while streaming; never log bytes. */
export async function verifyZfilesR2QaBody(
  body: AsyncIterable<Uint8Array>,
  expected: Pick<ZfilesR2QaFixture, 'sizeBytes' | 'sha256'>,
): Promise<void> {
  if (
    !Number.isSafeInteger(expected.sizeBytes) ||
    expected.sizeBytes < 1 ||
    expected.sizeBytes > SUPPLIER_ATTACHMENT_MAX_BYTES ||
    !/^[0-9a-f]{64}$/.test(expected.sha256)
  ) {
    throw new Error('R2 QA verification metadata is invalid');
  }
  let length = 0;
  const digest = createHash('sha256');
  for await (const bytes of body) {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error('R2 QA returned an invalid stream chunk');
    }
    length += bytes.byteLength;
    if (length > expected.sizeBytes || length > SUPPLIER_ATTACHMENT_MAX_BYTES) {
      throw new Error('R2 QA stream exceeded the expected size');
    }
    digest.update(bytes);
  }
  if (length !== expected.sizeBytes || digest.digest('hex') !== expected.sha256) {
    throw new Error('R2 QA object size or SHA-256 does not match');
  }
}

/**
 * Reads one exact private fixture, never a bucket-wide inventory.
 * Only call after requireZfilesR2QaFixture has accepted the local environment.
 */
export async function verifyZfilesR2QaObject(
  client: S3Client,
  fixture: ZfilesR2QaFixture,
): Promise<void> {
  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: fixture.privateBucket,
      Prefix: fixture.objectKey,
      MaxKeys: 1,
    }),
    { abortSignal: AbortSignal.timeout(10_000) },
  );
  if (!listed.Contents?.some((item) => item.Key === fixture.objectKey)) {
    throw new Error('R2 QA synthetic object is not listed');
  }
  const received = await client.send(
    new GetObjectCommand({
      Bucket: fixture.privateBucket,
      Key: fixture.objectKey,
    }),
    { abortSignal: AbortSignal.timeout(10_000) },
  );
  const body = received.Body;
  if (received.ContentLength !== undefined) {
    if (received.ContentLength !== fixture.sizeBytes) {
      if (body instanceof Readable) body.destroy();
      throw new Error('R2 QA object length header differs from fixture');
    }
  }
  if (!(body instanceof Readable)) {
    throw new Error('R2 QA returned a non-Node readable body');
  }
  try {
    await verifyZfilesR2QaBody(body, fixture);
  } finally {
    body.destroy();
  }
}
