import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:net';
import { Readable } from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ClamAvReadinessProbe,
  evaluateClamAvVersion,
  type ClamAvReadinessPolicy,
} from './zfiles-clamav-readiness-lab';
import {
  scanVerifiedQuarantineQaObject,
  type QuarantineScannerQaFixture,
} from './zfiles-r2-quarantine-scan-qa';

const policy: ClamAvReadinessPolicy = {
  policyVersion: 'zfiles-b4-lab-v1',
  daemonTimeZone: 'UTC',
  allowedEngineVersions: ['1.4.3'],
  maxDatabaseAgeMs: 48 * 60 * 60 * 1_000,
  maxFutureClockSkewMs: 5 * 60 * 1_000,
};

const at = Date.UTC(2026, 9, 26, 12, 0, 0);
const valid = 'ClamAV 1.4.3/28001/Mon Oct 26 11:00:00 2026';

describe('ClamAV ZFILES-R2-03B4 readiness gate (unattested)', () => {
  it('recognizes an explicitly approved engine and recent database only', () => {
    expect(evaluateClamAvVersion(valid, policy, at)).toEqual({
      engineVersion: '1.4.3',
      databaseVersion: 28001,
      databaseBuiltAt: '2026-10-26T11:00:00.000Z',
      observedAt: '2026-10-26T12:00:00.000Z',
      policyVersion: 'zfiles-b4-lab-v1',
      attested: false,
    });
  });

  it.each([
    'ClamAV 1.0.0/28001/Mon Oct 26 11:00:00 2026',
    'ClamAV 1.4.3/28001/Sun Oct 26 11:00:00 2026',
    'ClamAV 1.4.3/28001/Mon Feb 30 11:00:00 2026',
    'ClamAV 1.4.3/28001/Mon Oct 26 11:00:00 2026\nOK',
    'ClamAV 1.4.3/0/Mon Oct 26 11:00:00 2026',
    'clamd ready',
  ])('rejects invalid or unapproved metadata: %s', (reply) => {
    expect(() => evaluateClamAvVersion(reply, policy, at)).toThrow(
      ServiceUnavailableException,
    );
  });

  it('fails closed on stale or future signatures', () => {
    expect(() =>
      evaluateClamAvVersion(valid, policy, at + 49 * 60 * 60 * 1_000),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      evaluateClamAvVersion(valid, policy, at - 70 * 60 * 1_000),
    ).toThrow(ServiceUnavailableException);
  });

  it('rejects missing version pin or invalid policy before probing', () => {
    const badPolicy = { ...policy, allowedEngineVersions: [] };
    expect(
      () => new ClamAvReadinessProbe('/tmp/clamd.sock', badPolicy),
    ).toThrow(BadRequestException);
    expect(
      () => new ClamAvReadinessProbe('tcp://localhost:3310', policy),
    ).toThrow(BadRequestException);
  });

  async function fixture(
    replyFor: (command: string) => string | null,
  ): Promise<{
    socket: string;
    stop: () => Promise<void>;
    commands: string[];
  }> {
    const dir = await mkdtemp(join(tmpdir(), 'zaping-clamd-health-'));
    const socket = join(dir, 'clamd.sock');
    const commands: string[] = [];
    const server: Server = createServer((client) => {
      let bytes = Buffer.alloc(0);
      client.on('data', (chunk: Buffer) => {
        bytes = Buffer.concat([bytes, chunk]);
        const end = bytes.indexOf(0);
        if (end < 0) return;
        const command = bytes.subarray(0, end).toString('ascii');
        commands.push(command);
        const reply = replyFor(command);
        if (reply === null) client.destroy();
        else client.end(Buffer.from(reply + '\0', 'utf8'));
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socket, resolve);
    });
    return {
      socket,
      commands,
      stop: async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await rm(dir, { recursive: true, force: true });
      },
    };
  }

  it('checks PING then VERSION over a real local Unix socket', async () => {
    const f = await fixture((command) =>
      command === 'zPING' ? 'PONG' : command === 'zVERSION' ? valid : null,
    );
    try {
      const result = await new ClamAvReadinessProbe(f.socket, policy).check(at);
      expect(result.attested).toBe(false);
      expect(f.commands).toEqual(['zPING', 'zVERSION']);
    } finally {
      await f.stop();
    }
  });

  it('fails closed when daemon PING is unresponsive or invalid', async () => {
    const f = await fixture(() => null);
    try {
      await expect(
        new ClamAvReadinessProbe(f.socket, policy).check(at),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(f.commands).toEqual(['zPING']);
    } finally {
      await f.stop();
    }
  });

  it('fails closed when VERSION does not arrive', async () => {
    const f = await fixture((command) => (command === 'zPING' ? 'PONG' : null));
    try {
      await expect(
        new ClamAvReadinessProbe(f.socket, policy).check(at),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      await f.stop();
    }
  });
  it('uses actual Unix PING/VERSION before and after an exact in-memory QA scan', async () => {
    const f = await fixture((command) =>
      command === 'zPING' ? 'PONG' : command === 'zVERSION' ? valid : null,
    );
    const bytes = Buffer.from('%PDF-1.4\\nsynthetic\\n%%EOF\\n');
    const companyId = '11111111-1111-4111-8111-111111111111';
    const documentId = '22222222-2222-4222-8222-222222222222';
    const attachmentId = '33333333-3333-4333-8333-333333333333';
    const qa: QuarantineScannerQaFixture = {
      bucket: 'zaping-quarantine-qa',
      endpoint: 'https://example.invalid',
      companyId,
      documentId,
      attachmentId,
      key: ['quarantine', companyId, documentId, attachmentId].join('/'),
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    const send = jest.fn((command: unknown) => {
      if (!(command instanceof GetObjectCommand)) {
        throw new Error('Only GetObject is permitted in QA');
      }
      return Promise.resolve({
        Body: Readable.from([bytes]),
        ContentLength: bytes.length,
      });
    });
    const scanner = {
      scan: jest.fn(() => Promise.resolve('CLAMD_OK_UNATTESTED' as const)),
    };
    const probe = new ClamAvReadinessProbe(f.socket, policy);
    try {
      await expect(
        scanVerifiedQuarantineQaObject(
          { send },
          qa,
          scanner,
          { check: () => probe.check(at) },
        ),
      ).resolves.toBe('CLAMD_OK_UNATTESTED');
      expect(send).toHaveBeenCalledTimes(1);
      expect(scanner.scan).toHaveBeenCalledTimes(1);
      expect(f.commands).toEqual(['zPING', 'zVERSION', 'zPING', 'zVERSION']);
    } finally {
      await f.stop();
    }
  });
});
