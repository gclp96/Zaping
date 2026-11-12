import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:net';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ClamAvReadinessProbe,
  evaluateClamAvVersion,
  type ClamAvReadinessPolicy,
} from './zfiles-clamav-readiness-lab';

const policy: ClamAvReadinessPolicy = {
  policyVersion: 'zfiles-c1-offline-lab-v1',
  daemonTimeZone: 'UTC',
  allowedEngineVersions: ['1.5.4'],
  maxDatabaseAgeMs: 48 * 60 * 60 * 1_000,
  maxFutureClockSkewMs: 5 * 60 * 1_000,
};
const at = Date.UTC(2026, 10, 11, 13, 0, 0);
const valid = 'ClamAV 1.5.4/28001/Wed Nov 11 12:00:00 2026';

describe('ZFILES-SCAN-01C1 ClamAV PING/VERSION offline readiness', () => {
  it('accepts a pinned engine and recent version metadata as UNATTESTED', () => {
    expect(evaluateClamAvVersion(valid, policy, at)).toEqual({
      engineVersion: '1.5.4',
      databaseVersion: 28001,
      databaseBuiltAt: '2026-11-11T12:00:00.000Z',
      observedAt: '2026-11-11T13:00:00.000Z',
      policyVersion: 'zfiles-c1-offline-lab-v1',
      attested: false,
    });
  });

  it.each([
    'ClamAV 1.4.3/28001/Wed Nov 11 12:00:00 2026',
    'ClamAV 1.5.4/0/Wed Nov 11 12:00:00 2026',
    'ClamAV 1.5.4/28001/Tue Nov 11 12:00:00 2026',
    'ClamAV 1.5.4/28001/Wed Feb 30 12:00:00 2026',
    'ClamAV 1.5.4/28001/Wed Nov 11 12:00:00 2026\nPONG',
    'clamd ready',
  ])('rejects unexpected VERSION response: %s', (reply) => {
    expect(() => evaluateClamAvVersion(reply, policy, at)).toThrow(
      ServiceUnavailableException,
    );
  });

  it('fails closed on stale or future-dated database metadata', () => {
    expect(() =>
      evaluateClamAvVersion(valid, policy, at + 49 * 60 * 60 * 1_000),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      evaluateClamAvVersion(valid, policy, at - 70 * 60 * 1_000),
    ).toThrow(ServiceUnavailableException);
  });

  it('rejects missing engine pins or invalid socket paths', () => {
    expect(
      () =>
        new ClamAvReadinessProbe('/tmp/clamd.sock', {
          ...policy,
          allowedEngineVersions: [],
        }),
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
    const dir = await mkdtemp(join(tmpdir(), 'zfiles-clamd-ready-'));
    const socket =
      process.platform === 'win32'
        ? '\\\\.\\pipe\\zfiles-ready-' + randomUUID()
        : join(dir, 'clamd.sock');
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

  it('sends PING then VERSION to a real local test socket', async () => {
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

  it('fails closed when PING fails, before requesting VERSION', async () => {
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

  it('fails closed when VERSION is unavailable', async () => {
    const f = await fixture((command) => (command === 'zPING' ? 'PONG' : null));
    try {
      await expect(
        new ClamAvReadinessProbe(f.socket, policy).check(at),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(f.commands).toEqual(['zPING', 'zVERSION']);
    } finally {
      await f.stop();
    }
  });
});
