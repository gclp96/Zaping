import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  createSyntheticQuarantinePdf,
  createZfilesQuarantineQaClient,
  requireZfilesQuarantineQaConfig,
  summarizeZfilesQuarantineQaError,
  type ZfilesQuarantineQaPhase,
  writeAndVerifyQuarantineQaFixture,
} from './zfiles-r2-quarantine-qa';

const validEnv: NodeJS.ProcessEnv = {
  RUN_ZFILES_R2_QUARANTINE_QA_WRITE: '1',
  R2_PRIVATE_BUCKET: 'zaping-private-qa',
  R2_QUARANTINE_BUCKET: 'zaping-quarantine-qa',
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_JURISDICTION: 'default',
  R2_QUARANTINE_WRITE_ACCESS_KEY_ID: 'synthetic-only-access',
  R2_QUARANTINE_WRITE_SECRET_ACCESS_KEY: 'synthetic-only-secret',
};

describe('ZFILES-R2-03A quarantine QA transport', () => {

  it('reports only allowlisted failures without leaking SDK messages', () => {
    const secret = 'synthetic-only-secret';
    const key = 'quarantine/private-fixture-secret-key';
    expect(
      summarizeZfilesQuarantineQaError({
        name: 'AccessDenied',
        message: secret + key,
        $metadata: { httpStatusCode: 403, requestId: secret },
      }),
    ).toBe('AccessDenied HTTP 403');
    expect(
      summarizeZfilesQuarantineQaError({
        name: secret,
        message: key,
        $metadata: { httpStatusCode: 500, requestId: secret },
      }),
    ).toBe('UNCLASSIFIED HTTP 500');
    expect(summarizeZfilesQuarantineQaError(null)).toBe('UNCLASSIFIED');
  });

  it('requires explicit local-only opt-in and quarantine scope', () => {
    const config = requireZfilesQuarantineQaConfig(validEnv);
    expect(config).toEqual({
      bucket: 'zaping-quarantine-qa',
      region: 'auto',
      endpoint: 'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com',
    });
    expect(JSON.stringify(config)).not.toContain('synthetic-only-secret');
  });

  it.each([
    { RUN_ZFILES_R2_QUARANTINE_QA_WRITE: '0' },
    { CI: 'true' },
    { GITHUB_ACTIONS: 'true' },
    { R2_QUARANTINE_BUCKET: 'zaping-private-qa' },
    { R2_QUARANTINE_BUCKET: 'zaping-quarantine-prod' },
    { R2_PRIVATE_BUCKET: 'zaping-private-prod' },
    { R2_JURISDICTION: 'other' },
    { R2_JURISDICTION: 'fedramp-high' },
    { R2_ACCOUNT_ID: 'bad' },
  ])('rejects unsafe QA configuration %j', (patch) => {
    expect(() =>
      requireZfilesQuarantineQaConfig({
        ...validEnv,
        ...patch,
      }),
    ).toThrow();
  });

  it('uses explicit credentials and does not create a live connection', () => {
    const { client, config } = createZfilesQuarantineQaClient(validEnv);
    try {
      expect(client).toBeInstanceOf(S3Client);
      expect(config.bucket).toBe('zaping-quarantine-qa');
    } finally {
      client.destroy();
    }
  });

  it('rejects missing write credentials before constructing SDK client', () => {
    for (const patch of [
      { R2_QUARANTINE_WRITE_ACCESS_KEY_ID: '' },
      { R2_QUARANTINE_WRITE_SECRET_ACCESS_KEY: '' },
    ]) {
      expect(() =>
        createZfilesQuarantineQaClient({
          ...validEnv,
          ...patch,
        }),
      ).toThrow();
    }
  });

  it('constructs unique synthetic PDFs with strict SHA and quarantine keys', () => {
    const first = createSyntheticQuarantinePdf();
    const next = createSyntheticQuarantinePdf();
    expect(first.key).toMatch(
      /^quarantine\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/,
    );
    expect(next.key).not.toBe(first.key);
    expect(first.key).not.toContain('private/');
    expect(first.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(first.sha256).toBe(
      createHash('sha256').update(first.bytes).digest('hex'),
    );
  });

  it('uses only create-once Put and exact Get from quarantine QA', async () => {
    const config = requireZfilesQuarantineQaConfig(validEnv);
    let uploaded: Buffer | undefined;
    let key: string | undefined;
    const send = jest.fn((command: unknown) => {
      if (command instanceof PutObjectCommand) {
        const input = command.input;
        expect(input.Bucket).toBe('zaping-quarantine-qa');
        expect(input.IfNoneMatch).toBe('*');
        expect(input.ContentType).toBe('application/pdf');
        expect(input.ContentMD5).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
        expect(Buffer.isBuffer(input.Body)).toBe(true);
        uploaded = input.Body as Buffer;
        expect(input.ContentLength).toBe(uploaded.length);
        key = input.Key;
        return { ETag: 'synthetic-qa' };
      }
      if (command instanceof GetObjectCommand) {
        expect(command.input.Bucket).toBe('zaping-quarantine-qa');
        expect(command.input.Key).toBe(key);
        if (!uploaded) throw new Error('Missing mocked upload');
        return {
          ContentLength: uploaded.length,
          Body: Readable.from([uploaded]),
        };
      }
      throw new Error('Unexpected S3 command');
    });

    const phases: ZfilesQuarantineQaPhase[] = [];
    const result = await writeAndVerifyQuarantineQaFixture(
      { send } as unknown as S3Client,
      config,
      (phase) => phases.push(phase),
    );
    expect(phases).toEqual(['prepare', 'put', 'get', 'verify']);
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.key).toBe(key);
    expect(result.sizeBytes).toBe(uploaded?.length);
    expect(result.sha256).toBe(
      createHash('sha256')
        .update(uploaded as Buffer)
        .digest('hex'),
    );
  });

  it('does not call Get when the conditional Put conflicts', async () => {
    const config = requireZfilesQuarantineQaConfig(validEnv);
    const send = jest.fn(() => {
      throw new Error('PreconditionFailed');
    });
    await expect(
      writeAndVerifyQuarantineQaFixture(
        { send } as unknown as S3Client,
        config,
      ),
    ).rejects.toThrow('PreconditionFailed');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('fails closed on altered bytes or unexpected metadata', async () => {
    const config = requireZfilesQuarantineQaConfig(validEnv);
    const altered = Buffer.from('altered');
    const send = jest.fn((command: unknown) => {
      if (command instanceof PutObjectCommand) return {};
      if (command instanceof GetObjectCommand) {
        return {
          ContentLength: altered.length,
          Body: Readable.from([altered]),
        };
      }
      throw new Error('Unexpected command');
    });
    await expect(
      writeAndVerifyQuarantineQaFixture(
        { send } as unknown as S3Client,
        config,
      ),
    ).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('rejects any attempt to use private bucket as a write destination', async () => {
    const config = requireZfilesQuarantineQaConfig(validEnv);
    const send = jest.fn();
    await expect(
      writeAndVerifyQuarantineQaFixture({ send } as unknown as S3Client, {
        ...config,
        bucket: 'zaping-private-qa' as 'zaping-quarantine-qa',
      }),
    ).rejects.toThrow('quarantine bucket');
    expect(send).not.toHaveBeenCalled();
  });
});
