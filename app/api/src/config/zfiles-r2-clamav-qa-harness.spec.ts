import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { ClamAvProtocolVerdict } from './zfiles-clamav-instream-lab';
import type { ClamAvReadiness } from './zfiles-clamav-readiness-lab';
import {
  requireZfilesR2ClamAvQaScope,
  runZfilesR2ClamAvQa,
  ZFILES_SCAN_01F_QA_MANIFEST,
  type QaTransportFactory,
} from './zfiles-r2-clamav-qa-harness';

const env: NodeJS.ProcessEnv = {
  RUN_ZFILES_R2_CLAMAV_LIVE_QA: '1',
  CI: 'false',
  GITHUB_ACTIONS: 'false',
  TZ: 'UTC',
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_JURISDICTION: 'default',
  R2_PRIVATE_BUCKET: 'zaping-private-qa',
  R2_QUARANTINE_BUCKET: 'zaping-quarantine-qa',
  R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID: 'synthetic-s3-access',
  R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY: 'synthetic-s3-secret',
  CLAMD_SOCKET: '/run/zaping-clamd/clamd.sock',
};
const bytes = Buffer.from(
  '%PDF-1.4\n% ZAPING SYNTHETIC QA\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
  'ascii',
);
const readiness: ClamAvReadiness = {
  engineVersion: '1.5.4',
  databaseVersion: 30001,
  databaseBuiltAt: '2026-11-12T12:00:00.000Z',
  observedAt: '2026-11-12T12:10:00.000Z',
  policyVersion: 'zfiles-scan-01f1-qa-v1',
  attested: false,
};

function setup(verdict: ClamAvProtocolVerdict = 'CLAMD_OK_UNATTESTED') {
  const events: string[] = [];
  const send = jest.fn((command: unknown) => {
    events.push('get');
    if (!(command instanceof GetObjectCommand))
      throw new Error('Unexpected S3 operation');
    return Promise.resolve({
      ETag: ZFILES_SCAN_01F_QA_MANIFEST.etag,
      ContentLength: bytes.length,
      Body: Readable.from([bytes]),
    });
  });
  const scanner = {
    scan: jest.fn((input: Buffer) => {
      events.push('scan');
      expect(input).toEqual(bytes);
      return Promise.resolve(verdict);
    }),
  };
  const probe = {
    check: jest.fn(() => {
      events.push('readiness');
      return Promise.resolve(readiness);
    }),
  };
  const close = jest.fn(() => events.push('close'));
  const factory: QaTransportFactory = () => ({
    client: { send },
    scanner,
    readiness: probe,
    close,
  });
  return { factory, send, scanner, probe, close, events };
}

describe('ZFILES-SCAN-01F1 hermetic R2 + ClamAV QA wiring', () => {
  it('pins only the proven synthetic fixture, including its original SHA-256', () => {
    expect(bytes.length).toBe(73);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      ZFILES_SCAN_01F_QA_MANIFEST.sha256,
    );
    expect(ZFILES_SCAN_01F_QA_MANIFEST.etag).toMatch(/^"[a-f0-9]{32}"$/u);
    expect(ZFILES_SCAN_01F_QA_MANIFEST.owner.kind).toBe('PURCHASE_RECEIPT');
  });

  it('requires explicit QA scope and never returns secrets', () => {
    const scope = requireZfilesR2ClamAvQaScope(env);
    expect(scope.endpoint).toBe(
      'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com',
    );
    expect(scope.socketPath).toBe('/run/zaping-clamd/clamd.sock');
    expect(JSON.stringify(scope)).not.toContain('synthetic-s3-secret');
  });

  it.each([
    { RUN_ZFILES_R2_CLAMAV_LIVE_QA: '0' },
    { CI: 'true' },
    { GITHUB_ACTIONS: 'true' },
    { TZ: 'America/Hermosillo' },
    { R2_PRIVATE_BUCKET: 'zaping-private-prod' },
    { R2_QUARANTINE_BUCKET: 'zaping-quarantine-prod' },
    { R2_JURISDICTION: 'eu' },
    { R2_ACCOUNT_ID: 'invalid' },
    { R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID: '' },
    { R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY: '' },
    { R2_QUARANTINE_WRITE_ACCESS_KEY_ID: 'forbidden' },
    { CLAMD_SOCKET: 'relative/path' },
  ])(
    'rejects unsafe environment before making a network call (%j)',
    async (patch) => {
      const f = setup();
      await expect(
        runZfilesR2ClamAvQa({ ...env, ...patch }, f.factory),
      ).rejects.toThrow();
      expect(f.send).not.toHaveBeenCalled();
      expect(f.scanner.scan).not.toHaveBeenCalled();
    },
  );

  it('reads one exact object and sends verified bytes for a single scan', async () => {
    const f = setup();
    await expect(runZfilesR2ClamAvQa(env, f.factory)).resolves.toBe(
      'CLAMD_OK_UNATTESTED',
    );
    expect(f.events).toEqual([
      'readiness',
      'get',
      'scan',
      'readiness',
      'close',
    ]);
    expect(f.send).toHaveBeenCalledTimes(1);
    const command = f.send.mock.calls[0][0] as GetObjectCommand;
    expect(command.input).toEqual({
      Bucket: 'zaping-quarantine-qa',
      Key: 'quarantine/2a4c5d3a-0f66-42e9-8d74-eea7c80bb762/597d19d0-bef3-4451-aacb-9db7b4e792e3/213af81c-fb81-402f-947f-e3e2de0077cd',
      IfMatch: '"b9f6aafd18e3e5fe4dc37577f4b2c124"',
    });
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it('keeps MALWARE_DETECTED distinct and never claims CLEAN or AVAILABLE', async () => {
    const f = setup('MALWARE_DETECTED');
    await expect(runZfilesR2ClamAvQa(env, f.factory)).resolves.toBe(
      'MALWARE_DETECTED',
    );
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it('fails closed on corrupted object bytes, with cleanup and no scan', async () => {
    const f = setup();
    f.send.mockImplementationOnce(() =>
      Promise.resolve({
        ETag: ZFILES_SCAN_01F_QA_MANIFEST.etag,
        ContentLength: bytes.length,
        Body: Readable.from([Buffer.alloc(bytes.length)]),
      }),
    );
    await expect(runZfilesR2ClamAvQa(env, f.factory)).rejects.toThrow(
      'ZFILES-SCAN-01F QA scan was not verified',
    );
    expect(f.scanner.scan).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it('fails closed if scanner rejects, without exposing internal details', async () => {
    const f = setup();
    f.scanner.scan.mockImplementationOnce(() =>
      Promise.reject(new Error('secret socket path')),
    );
    await expect(runZfilesR2ClamAvQa(env, f.factory)).rejects.toThrow(
      'ZFILES-SCAN-01F QA scan was not verified',
    );
    expect(f.close).toHaveBeenCalledTimes(1);
  });
});
