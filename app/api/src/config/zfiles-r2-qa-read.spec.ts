import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  createZfilesR2QaReadClient,
  verifyZfilesR2QaBody,
  verifyZfilesR2QaObject,
} from './zfiles-r2-qa-read';

const companyId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const attachmentId = '33333333-3333-4333-8333-333333333333';
const objectKey = `private/${companyId}/${documentId}/${attachmentId}`;
const accessKey = 'synthetic-key-only';
const secretKey = 'synthetic-secret-only';

function fixtureEnvironment(patch: NodeJS.ProcessEnv = {}) {
  const payload = Buffer.from('ZAPING-R2-QA-SYNTHETIC-ONLY');
  return {
    RUN_CLOUDFLARE_R2_QA_SMOKE: '1',
    R2_ACCOUNT_ID: 'a'.repeat(32),
    R2_JURISDICTION: 'default',
    R2_PRIVATE_BUCKET: 'zaping-private-qa',
    R2_QUARANTINE_BUCKET: 'zaping-quarantine-qa',
    R2_QA_FIXTURE_COMPANY_ID: companyId,
    R2_QA_FIXTURE_OBJECT_KEY: objectKey,
    R2_QA_FIXTURE_SIZE_BYTES: String(payload.length),
    R2_QA_FIXTURE_SHA256: createHash('sha256').update(payload).digest('hex'),
    R2_READ_ACCESS_KEY_ID: accessKey,
    R2_READ_SECRET_ACCESS_KEY: secretKey,
    ...patch,
  };
}

describe('ZFILES-R2-02B read-only R2 QA transport', () => {
  it('creates explicit-credential S3 client without any request', async () => {
    const { client, fixture } =
      createZfilesR2QaReadClient(fixtureEnvironment());
    try {
      expect(client).toBeInstanceOf(S3Client);
      expect(await client.config.region()).toBe('auto');
      expect(fixture.privateBucket).toBe('zaping-private-qa');
      expect(fixture.objectKey).toBe(objectKey);
    } finally {
      client.destroy();
    }
  });

  it.each([
    { R2_READ_ACCESS_KEY_ID: '' },
    { R2_READ_SECRET_ACCESS_KEY: '' },
    { R2_PRIVATE_BUCKET: 'zaping-private-prod' },
    { R2_QA_FIXTURE_COMPANY_ID: documentId },
    { CI: 'true' },
  ])('fails closed before creating the SDK client: %j', (patch) => {
    expect(() =>
      createZfilesR2QaReadClient(fixtureEnvironment(patch)),
    ).toThrow();
  });

  it('does not print access credentials or the object key in errors', () => {
    try {
      createZfilesR2QaReadClient(
        fixtureEnvironment({ R2_READ_SECRET_ACCESS_KEY: '' }),
      );
      throw new Error('Expected missing secret to throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      expect(message).not.toContain(accessKey);
      expect(message).not.toContain(secretKey);
      expect(message).not.toContain(objectKey);
    }
  });

  it('verifies exact streamed bytes without buffering them', async () => {
    const a = Buffer.from('ZAPING-');
    const b = Buffer.from('R2-QA-ONLY');
    const payload = Buffer.concat([a, b]);
    await expect(
      verifyZfilesR2QaBody(Readable.from([a, b]), {
        sizeBytes: payload.length,
        sha256: createHash('sha256').update(payload).digest('hex'),
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects altered hash, truncated bytes and oversized content', async () => {
    const data = Buffer.from('tiny');
    const checksum = createHash('sha256').update(data).digest('hex');
    await expect(
      verifyZfilesR2QaBody(Readable.from([data]), {
        sizeBytes: data.length,
        sha256: 'f'.repeat(64),
      }),
    ).rejects.toThrow();
    await expect(
      verifyZfilesR2QaBody(Readable.from([data]), {
        sizeBytes: data.length + 1,
        sha256: checksum,
      }),
    ).rejects.toThrow();
    await expect(
      verifyZfilesR2QaBody(Readable.from([data, data]), {
        sizeBytes: data.length,
        sha256: checksum,
      }),
    ).rejects.toThrow();
  });

  it('rejects impossible verification metadata without reading the stream', async () => {
    const body = Readable.from([Buffer.from('tiny')]);
    await expect(
      verifyZfilesR2QaBody(body, {
        sizeBytes: 10 * 1024 * 1024 + 1,
        sha256: 'a'.repeat(64),
      }),
    ).rejects.toThrow();
    body.destroy();
  });

  it('requests only the exact synthetic QA key with read commands', async () => {
    const { client, fixture } =
      createZfilesR2QaReadClient(fixtureEnvironment());
    const bytes = Buffer.from('ZAPING-R2-QA-SYNTHETIC-ONLY');
    const send = jest.fn((command: unknown) => {
      if (command instanceof ListObjectsV2Command) {
        expect(command.input).toEqual({
          Bucket: 'zaping-private-qa',
          Prefix: objectKey,
          MaxKeys: 1,
        });
        return { Contents: [{ Key: objectKey }] };
      }
      if (command instanceof GetObjectCommand) {
        expect(command.input).toEqual({
          Bucket: 'zaping-private-qa',
          Key: objectKey,
        });
        return { Body: Readable.from([bytes]), ContentLength: bytes.length };
      }
      throw new Error('Unexpected S3 command');
    });
    try {
      await expect(
        verifyZfilesR2QaObject({ send } as unknown as S3Client, fixture),
      ).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      client.destroy();
    }
  });

  it('refuses to fetch when exact synthetic object is absent', async () => {
    const { client, fixture } =
      createZfilesR2QaReadClient(fixtureEnvironment());
    const send = jest.fn(() => ({ Contents: [{ Key: 'other' }] }));
    try {
      await expect(
        verifyZfilesR2QaObject({ send } as unknown as S3Client, fixture),
      ).rejects.toThrow('R2 QA synthetic object is not listed');
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      client.destroy();
    }
  });
});
