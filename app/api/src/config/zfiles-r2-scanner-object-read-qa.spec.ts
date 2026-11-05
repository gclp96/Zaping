import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  createScannerObjectReadQaClient,
  verifyScannerObjectReadQaScope,
  type ScannerObjectReadQaScope,
} from './zfiles-r2-scanner-object-read-qa';

const companyId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const attachmentId = '33333333-3333-4333-8333-333333333333';
const bytes = Buffer.from('%PDF-1.4\nZAPING SYNTHETIC 03C3A\n%%EOF\n');
const privateFixtureKey =
  'private/44444444-4444-4444-8444-444444444444/' +
  '55555555-5555-4555-8555-555555555555/' +
  '66666666-6666-4666-8666-666666666666';

const scope: ScannerObjectReadQaScope = {
  fixture: {
    bucket: 'zaping-quarantine-qa',
    endpoint: 'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com',
    key: ['quarantine', companyId, documentId, attachmentId].join('/'),
    companyId,
    documentId,
    attachmentId,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  },
  privateFixtureKey,
};

const blocked = () =>
  Object.assign(new Error('do not surface SDK errors'), {
    name: 'AccessDenied',
    $metadata: { httpStatusCode: 403 },
  });

function fixtureClient(options?: {
  badBytes?: boolean;
  privateResponse?:
    'denied' | 'generic403' | 'missing' | 'allowed' | 'unauthorized';
  headLength?: number;
}) {
  const commands: string[] = [];
  const send = jest.fn((command: unknown) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Bucket === 'zaping-private-qa') {
        commands.push('HEAD_PRIVATE');
        if (options?.privateResponse === 'allowed') {
          return Promise.resolve({ ETag: '"private"' });
        }
        if (options?.privateResponse === 'missing') {
          throw Object.assign(new Error('fixture not found'), {
            name: 'NotFound',
            $metadata: { httpStatusCode: 404 },
          });
        }
        if (options?.privateResponse === 'unauthorized') {
          throw Object.assign(new Error('unauthorized'), {
            name: 'Unauthorized',
            $metadata: { httpStatusCode: 401 },
          });
        }
        if (options?.privateResponse === 'generic403') {
          throw Object.assign(new Error('generic HEAD error'), {
            name: 'UnknownError',
            $metadata: { httpStatusCode: 403 },
          });
        }
        throw blocked();
      }
      commands.push('HEAD_QUARANTINE');
      expect(command.input).toEqual({
        Bucket: 'zaping-quarantine-qa',
        Key: scope.fixture.key,
      });
      return Promise.resolve({
        ContentLength: options?.headLength ?? bytes.length,
        ETag: '"known-qa-etag"',
      });
    }
    if (command instanceof GetObjectCommand) {
      commands.push('GET_QUARANTINE');
      expect(command.input).toEqual({
        Bucket: 'zaping-quarantine-qa',
        Key: scope.fixture.key,
        IfMatch: '"known-qa-etag"',
      });
      return Promise.resolve({
        ContentLength: bytes.length,
        Body: Readable.from([
          options?.badBytes ? Buffer.from('TAMPERED') : bytes,
        ]),
      });
    }
    throw new Error('Unexpected S3 operation was attempted');
  });
  const client = { send } as unknown as Pick<S3Client, 'send'>;
  return { client, commands, send };
}

describe('ZFILES-R2-03C3A scanner Object Read QA (offline)', () => {
  it('allows verified quarantine HEAD/GET and requires explicit 403 on private QA', async () => {
    const x = fixtureClient();
    await expect(
      verifyScannerObjectReadQaScope(x.client, scope),
    ).resolves.toBeUndefined();
    expect(x.commands).toEqual([
      'HEAD_QUARANTINE',
      'GET_QUARANTINE',
      'HEAD_PRIVATE',
    ]);
    expect(x.send).toHaveBeenCalledTimes(3);
  });

  it('accepts generic 403 from HeadObject only after verified quarantine bytes', async () => {
    const x = fixtureClient({ privateResponse: 'generic403' });
    await expect(
      verifyScannerObjectReadQaScope(x.client, scope),
    ).resolves.toBeUndefined();
    expect(x.commands).toEqual([
      'HEAD_QUARANTINE',
      'GET_QUARANTINE',
      'HEAD_PRIVATE',
    ]);
  });

  it('does not accept private 401 as a scoped permission denial', async () => {
    const x = fixtureClient({ privateResponse: 'unauthorized' });
    await expect(
      verifyScannerObjectReadQaScope(x.client, scope),
    ).rejects.toThrow('[P_HEAD_HTTP_401]');
  });

  it('fails closed for a private object which is readable', async () => {
    const x = fixtureClient({ privateResponse: 'allowed' });
    await expect(
      verifyScannerObjectReadQaScope(x.client, scope),
    ).rejects.toThrow('QA permissions could not be verified');
    expect(x.commands).toHaveLength(3);
  });

  it('does not count a 404/missing private fixture as permission denial', async () => {
    const x = fixtureClient({ privateResponse: 'missing' });
    await expect(
      verifyScannerObjectReadQaScope(x.client, scope),
    ).rejects.toThrow('QA permissions could not be verified');
    expect(x.commands).toHaveLength(3);
  });

  it('never checks another bucket after an unexpected quarantine body', async () => {
    const x = fixtureClient({ badBytes: true });
    await expect(
      verifyScannerObjectReadQaScope(x.client, scope),
    ).rejects.toThrow('QA permissions could not be verified');
    expect(x.commands).toEqual(['HEAD_QUARANTINE', 'GET_QUARANTINE']);
  });

  it('fails closed when HEAD ContentLength mismatches', async () => {
    const x = fixtureClient({ headLength: 10 });
    await expect(
      verifyScannerObjectReadQaScope(x.client, scope),
    ).rejects.toThrow('QA permissions could not be verified');
    expect(x.commands).toEqual(['HEAD_QUARANTINE']);
  });

  it('reports a safe hash-verification stage without the SDK error or fixture key', async () => {
    const x = fixtureClient({ badBytes: true });
    await expect(
      verifyScannerObjectReadQaScope(x.client, scope),
    ).rejects.toThrow('[Q_BODY_VERIFICATION]');
  });

  it('reports private 404 as inconclusive rather than successful denial', async () => {
    const x = fixtureClient({ privateResponse: 'missing' });
    await expect(
      verifyScannerObjectReadQaScope(x.client, scope),
    ).rejects.toThrow('[P_HEAD_HTTP_404]');
  });

  it('reports private object readability as a security failure', async () => {
    const x = fixtureClient({ privateResponse: 'allowed' });
    await expect(
      verifyScannerObjectReadQaScope(x.client, scope),
    ).rejects.toThrow('[P_HEAD_ALLOWED]');
  });

  it('does not send a network request for an invalid key or bucket', async () => {
    for (const altered of [
      { fixture: { ...scope.fixture, bucket: 'zaping-private-qa' } },
      { fixture: { ...scope.fixture, key: 'quarantine/../secrets' } },
      { privateFixtureKey: 'private/../unknown' },
    ]) {
      const x = fixtureClient();
      await expect(
        verifyScannerObjectReadQaScope(x.client, {
          ...scope,
          ...altered,
        } as ScannerObjectReadQaScope),
      ).rejects.toThrow();
      expect(x.send).not.toHaveBeenCalled();
    }
  });

  it('requires local opt-in, declared token scope and dedicated credentials', () => {
    const env: NodeJS.ProcessEnv = {
      RUN_ZFILES_R2_SCANNER_OBJECT_READ_QA: '1',
      R2_SCANNER_QA_READ_ONLY_CONFIRMED: '1',
      R2_ACCOUNT_ID: 'a'.repeat(32),
      R2_JURISDICTION: 'default',
      R2_QUARANTINE_BUCKET: 'zaping-quarantine-qa',
      R2_PRIVATE_BUCKET: 'zaping-private-qa',
      R2_QUARANTINE_SCAN_COMPANY_ID: companyId,
      R2_QUARANTINE_SCAN_DOCUMENT_ID: documentId,
      R2_QUARANTINE_SCAN_ATTACHMENT_ID: attachmentId,
      R2_QUARANTINE_SCAN_SHA256: scope.fixture.sha256,
      R2_QUARANTINE_SCAN_SIZE_BYTES: String(bytes.length),
      R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID: 'synthetic-read-id',
      R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY: 'synthetic-read-secret',
      R2_SCANNER_QA_PRIVATE_FIXTURE_KEY: privateFixtureKey,
    };
    for (const altered of [
      { RUN_ZFILES_R2_SCANNER_OBJECT_READ_QA: '0' },
      { R2_SCANNER_QA_READ_ONLY_CONFIRMED: '0' },
      { CI: 'true' },
      { GITHUB_ACTIONS: 'true' },
      { R2_SCANNER_QA_PRIVATE_FIXTURE_KEY: 'private/../wrong' },
      { R2_QUARANTINE_WRITE_ACCESS_KEY_ID: 'synthetic-read-id' },
      { R2_READ_ACCESS_KEY_ID: 'synthetic-read-id' },
    ]) {
      expect(() =>
        createScannerObjectReadQaClient({ ...env, ...altered }),
      ).toThrow();
    }
    const { client, scope: parsed } = createScannerObjectReadQaClient(env);
    expect(parsed.fixture.key).toBe(scope.fixture.key);
    expect(parsed.privateFixtureKey).toBe(privateFixtureKey);
    client.destroy();
  });
});
