import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  createQuarantineScannerQaClient,
  requireQuarantineScannerQaFixture,
  scanVerifiedQuarantineQaObject,
  type QaClamAvScanner,
  type QaScannerReadiness,
  type QuarantineScannerQaFixture,
  type ScannerReadinessSnapshot,
} from './zfiles-r2-quarantine-scan-qa';

const company = '11111111-1111-4111-8111-111111111111';
const document = '22222222-2222-4222-8222-222222222222';
const attachment = '33333333-3333-4333-8333-333333333333';
const bytes = Buffer.from('%PDF-1.4\nsynthetic test\n%%EOF\n');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const validEnv: NodeJS.ProcessEnv = {
  RUN_ZFILES_R2_QUARANTINE_SCAN_QA: '1',
  R2_PRIVATE_BUCKET: 'zaping-private-qa',
  R2_QUARANTINE_BUCKET: 'zaping-quarantine-qa',
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_QUARANTINE_SCAN_COMPANY_ID: company,
  R2_QUARANTINE_SCAN_DOCUMENT_ID: document,
  R2_QUARANTINE_SCAN_ATTACHMENT_ID: attachment,
  R2_QUARANTINE_SCAN_SHA256: sha256,
  R2_QUARANTINE_SCAN_SIZE_BYTES: String(bytes.length),
  R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID: 'synthetic-read-only-key',
  R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY: 'synthetic-read-only-secret',
};
const base: ScannerReadinessSnapshot = {
  engineVersion: '1.4.3',
  databaseVersion: 27654,
  databaseBuiltAt: '2026-11-03T00:00:00.000Z',
  policyVersion: 'qa-v1',
  attested: false,
};

function setup(
  patch: Partial<QuarantineScannerQaFixture> = {},
  body: Buffer = bytes,
  before = base,
  after = base,
) {
  const fixture = {
    ...requireQuarantineScannerQaFixture(validEnv),
    ...patch,
  };
  const send = jest.fn(async (command: unknown) => {
    if (!(command instanceof GetObjectCommand)) throw new Error('unexpected write/list command');
    return {
      ContentLength: body.length,
      Body: Readable.from([body]),
    };
  });
  const scanner: QaClamAvScanner = {
    scan: jest.fn(async () => 'CLAMD_OK_UNATTESTED' as const),
  };
  const readiness: QaScannerReadiness = {
    check: jest.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after),
  };
  return { fixture, send, scanner, readiness };
}

describe('ZFILES-R2-03B3 read-only quarantine verified scan lab', () => {
  it('constructs only exact quarantine QA scope without network access', () => {
    const { client, fixture } = createQuarantineScannerQaClient(validEnv);
    try {
      expect(client).toBeInstanceOf(S3Client);
      expect(fixture.key).toBe('quarantine/' + company + '/' + document + '/' + attachment);
      expect(fixture.bucket).toBe('zaping-quarantine-qa');
      expect(JSON.stringify(fixture)).not.toContain('synthetic-read-only-secret');
    } finally {
      client.destroy();
    }
  });

  it.each([
    { RUN_ZFILES_R2_QUARANTINE_SCAN_QA: '0' },
    { CI: 'true' },
    { GITHUB_ACTIONS: 'true' },
    { R2_QUARANTINE_BUCKET: 'zaping-private-qa' },
    { R2_PRIVATE_BUCKET: 'production-private' },
    { R2_ACCOUNT_ID: 'invalid' },
    { R2_JURISDICTION: 'invalid' },
    { R2_QUARANTINE_SCAN_COMPANY_ID: 'other-tenant' },
    { R2_QUARANTINE_SCAN_ATTACHMENT_ID: '../private' },
    { R2_QUARANTINE_SCAN_SIZE_BYTES: '10485761' },
    { R2_QUARANTINE_SCAN_SIZE_BYTES: '0' },
    { R2_QUARANTINE_SCAN_SHA256: '0'.repeat(63) },
    { R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID: '' },
    { R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY: '' },
  ])('fails closed on unsafe config %j', (patch) => {
    expect(() => createQuarantineScannerQaClient({ ...validEnv, ...patch })).toThrow(
      'Quarantine QA scan was not verified',
    );
  });

  it('GETs exactly once, verifies the bytes before scan, and never promotes', async () => {
    const f = setup();
    const events: string[] = [];
    f.send.mockImplementation(async (command: unknown) => {
      events.push('get');
      if (!(command instanceof GetObjectCommand)) throw new Error('unexpected command');
      return { ContentLength: bytes.length, Body: Readable.from([bytes]) };
    });
    (f.readiness.check as jest.Mock).mockReset()
      .mockImplementationOnce(() => { events.push('pre'); return Promise.resolve(base); })
      .mockImplementationOnce(() => { events.push('post'); return Promise.resolve(base); });
    (f.scanner.scan as jest.Mock).mockImplementation(async (input: Buffer) => {
      events.push('scan');
      expect(input).toEqual(bytes);
      return 'CLAMD_OK_UNATTESTED';
    });
    await expect(scanVerifiedQuarantineQaObject(
      { send: f.send } as unknown as S3Client,
      f.fixture, f.scanner, f.readiness,
    )).resolves.toBe('CLAMD_OK_UNATTESTED');
    expect(events).toEqual(['pre', 'get', 'scan', 'post']);
    expect(f.send).toHaveBeenCalledTimes(1);
    const [command] = f.send.mock.calls[0] as unknown as [GetObjectCommand];
    expect(command.input).toEqual({ Bucket: 'zaping-quarantine-qa', Key: f.fixture.key });
  });

  it('passes detected EICAR result without reclassifying as CLEAN', async () => {
    const f = setup();
    (f.scanner.scan as jest.Mock).mockResolvedValue('MALWARE_DETECTED');
    await expect(scanVerifiedQuarantineQaObject(
      { send: f.send } as unknown as S3Client,
      f.fixture, f.scanner, f.readiness,
    )).resolves.toBe('MALWARE_DETECTED');
  });

  it.each([
    { label: 'modified hash', patch: { sha256: 'f'.repeat(64) }, body: bytes },
    { label: 'truncated stream', patch: {}, body: bytes.subarray(0, 8) },
    { label: 'oversized stream', patch: {}, body: Buffer.concat([bytes, bytes]) },
    { label: 'private key', patch: { key: 'private/' + company + '/' + document + '/' + attachment }, body: bytes },
    { label: 'cross-tenant key', patch: { key: 'quarantine/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' + document + '/' + attachment }, body: bytes },
    { label: 'private bucket', patch: { bucket: 'zaping-private-qa' as 'zaping-quarantine-qa' }, body: bytes },
  ])('rejects $label without scanning', async ({ patch, body }) => {
    const f = setup(patch, body);
    await expect(scanVerifiedQuarantineQaObject(
      { send: f.send } as unknown as S3Client,
      f.fixture, f.scanner, f.readiness,
    )).rejects.toThrow('Quarantine QA scan was not verified');
    expect(f.scanner.scan).not.toHaveBeenCalled();
  });

  it('rejects changed daemon version and never interprets it as clean', async () => {
    const f = setup({}, bytes, base, { ...base, databaseVersion: 27655 });
    await expect(scanVerifiedQuarantineQaObject(
      { send: f.send } as unknown as S3Client,
      f.fixture, f.scanner, f.readiness,
    )).rejects.toThrow('Quarantine QA scan was not verified');
  });

  it('rejects unavailable R2, daemon and readiness without leaking SDK errors', async () => {
    for (const phase of ['r2', 'daemon', 'readiness'] as const) {
      const f = setup();
      if (phase === 'r2') f.send.mockRejectedValue(new Error('secret-r2-key'));
      if (phase === 'daemon') (f.scanner.scan as jest.Mock).mockRejectedValue(new Error('secret-signature'));
      if (phase === 'readiness') (f.readiness.check as jest.Mock).mockRejectedValue(new Error('secret-socket'));
      await expect(scanVerifiedQuarantineQaObject(
        { send: f.send } as unknown as S3Client,
        f.fixture, f.scanner, f.readiness,
      )).rejects.toThrow('Quarantine QA scan was not verified');
    }
  });
});
