import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { ClamAvProtocolVerdict } from './zfiles-clamav-instream-lab';
import {
  scanVerifiedQuarantineQaObject,
  type QuarantineVerifiedReadQaManifest,
} from './zfiles-quarantine-verified-read-qa';
import type { ClamAvReadiness } from './zfiles-clamav-readiness-lab';

const companyId = '11111111-1111-4111-8111-111111111111';
const receiptId = '22222222-2222-4222-8222-222222222222';
const attachmentId = '33333333-3333-4333-8333-333333333333';
const original = Buffer.from('%PDF-1.4\nsynthetic QA file\n%%EOF\n');
const etag = '"11111111111111111111111111111111"';
const manifest: QuarantineVerifiedReadQaManifest = {
  owner: { kind: 'PURCHASE_RECEIPT', companyId, receiptId },
  attachmentId,
  sizeBytes: original.length,
  sha256: createHash('sha256').update(original).digest('hex'),
  etag,
};
const before: ClamAvReadiness = {
  engineVersion: '1.5.4',
  databaseVersion: 30000,
  databaseBuiltAt: '2026-11-12T12:00:00.000Z',
  observedAt: '2026-11-12T12:01:00.000Z',
  policyVersion: 'qa-only-v1',
  attested: false,
};

function setup(bytes: Buffer = original) {
  const events: string[] = [];
  const send = jest.fn((command: unknown) => {
    events.push('get');
    if (!(command instanceof GetObjectCommand)) {
      throw new Error('Unexpected non-GET operation');
    }
    return Promise.resolve({
      ETag: etag,
      ContentLength: bytes.length,
      Body: Readable.from([bytes]),
    });
  });
  const scanner = {
    scan: jest.fn((input: Buffer): Promise<ClamAvProtocolVerdict> => {
      events.push('scan');
      expect(input).toEqual(original);
      return Promise.resolve('CLAMD_OK_UNATTESTED');
    }),
  };
  const readiness = {
    check: jest.fn().mockImplementation(() => {
      events.push('readiness');
      return Promise.resolve(before);
    }),
  };
  const client = { send } as unknown as Pick<S3Client, 'send'>;
  return { events, send, scanner, readiness, client };
}

describe('ZFILES-SCAN-01D quarantine verified GET (offline QA)', () => {
  it('performs one exact conditional GET and pre/scan/post order', async () => {
    const f = setup();
    await expect(
      scanVerifiedQuarantineQaObject(
        f.client,
        manifest,
        f.scanner,
        f.readiness,
      ),
    ).resolves.toBe('CLAMD_OK_UNATTESTED');
    expect(f.events).toEqual(['readiness', 'get', 'scan', 'readiness']);
    expect(f.send).toHaveBeenCalledTimes(1);
    const command = f.send.mock.calls[0][0] as GetObjectCommand;
    expect(command.input).toEqual({
      Bucket: 'zaping-quarantine-qa',
      Key: `quarantine/${companyId}/${receiptId}/${attachmentId}`,
      IfMatch: etag,
    });
  });

  it('preserves MALWARE_DETECTED without claiming CLEAN', async () => {
    const f = setup();
    f.scanner.scan.mockResolvedValueOnce('MALWARE_DETECTED');
    await expect(
      scanVerifiedQuarantineQaObject(
        f.client,
        manifest,
        f.scanner,
        f.readiness,
      ),
    ).resolves.toBe('MALWARE_DETECTED');
  });

  it.each([
    { title: 'wrong SHA-256', change: { sha256: 'a'.repeat(64) } },
    {
      title: 'wrong expected size',
      change: { sizeBytes: original.length + 1 },
    },
    { title: 'wrong owner ID', change: { attachmentId: '../private' } },
    { title: 'unquoted weak ETag', change: { etag: 'W/"bad"' } },
    {
      title: 'oversized manifest',
      change: { sizeBytes: 10 * 1024 * 1024 + 1 },
    },
  ])('rejects $title without scanning', async ({ change }) => {
    const f = setup();
    await expect(
      scanVerifiedQuarantineQaObject(
        f.client,
        { ...manifest, ...change },
        f.scanner,
        f.readiness,
      ),
    ).rejects.toThrow('Quarantine QA scan was not verified');
    expect(f.scanner.scan).not.toHaveBeenCalled();
  });

  it('rejects a truncated stream even if its header claims the right size', async () => {
    const f = setup(original.subarray(0, 8));
    f.send.mockImplementationOnce(() =>
      Promise.resolve({
        ETag: etag,
        ContentLength: original.length,
        Body: Readable.from([original.subarray(0, 8)]),
      }),
    );
    await expect(
      scanVerifiedQuarantineQaObject(
        f.client,
        manifest,
        f.scanner,
        f.readiness,
      ),
    ).rejects.toThrow('Quarantine QA scan was not verified');
    expect(f.scanner.scan).not.toHaveBeenCalled();
  });

  it('rejects a changed ETag even if bytes otherwise match', async () => {
    const f = setup();
    f.send.mockImplementationOnce(() =>
      Promise.resolve({
        ETag: '"different"',
        ContentLength: original.length,
        Body: Readable.from([original]),
      }),
    );
    await expect(
      scanVerifiedQuarantineQaObject(
        f.client,
        manifest,
        f.scanner,
        f.readiness,
      ),
    ).rejects.toThrow('Quarantine QA scan was not verified');
    expect(f.scanner.scan).not.toHaveBeenCalled();
  });

  it('fails closed if database revision changes between checks', async () => {
    const f = setup();
    f.readiness.check
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce({ ...before, databaseVersion: 30001 });
    await expect(
      scanVerifiedQuarantineQaObject(
        f.client,
        manifest,
        f.scanner,
        f.readiness,
      ),
    ).rejects.toThrow('Quarantine QA scan was not verified');
  });

  it('redacts storage errors rather than leaking keys', async () => {
    const f = setup();
    f.send.mockRejectedValueOnce(new Error('SECRET-KEY: sensitive-path'));
    await expect(
      scanVerifiedQuarantineQaObject(
        f.client,
        manifest,
        f.scanner,
        f.readiness,
      ),
    ).rejects.toThrow('Quarantine QA scan was not verified');
    expect(f.scanner.scan).not.toHaveBeenCalled();
  });
});
