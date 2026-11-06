import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server, type Socket } from 'node:net';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClamAvInstreamScanner } from './zfiles-clamav-instream-lab';
import { SUPPLIER_ATTACHMENT_MAX_BYTES } from '../supplier-documents/supplier-document-attachment-validation';

type Fixture = {
  socketPath: string;
  server: Server;
  received: Buffer[];
  close: () => Promise<void>;
};

async function clamdFixture(response: string | null): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), 'zaping-clamd-'));
  const socketPath =
    process.platform === 'win32'
      ? '\\\\.\\pipe\\zaping-clamd-' + randomUUID()
      : join(dir, 'clamd.sock');
  const received: Buffer[] = [];
  const server = createServer((socket: Socket) => {
    let pending = Buffer.alloc(0);
    let commandReceived = false;
    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      if (!commandReceived) {
        if (pending.length < 10) return;
        if (pending.subarray(0, 10).toString('ascii') !== 'zINSTREAM\0') {
          socket.destroy();
          return;
        }
        pending = pending.subarray(10);
        commandReceived = true;
      }
      while (pending.length >= 4) {
        const length = pending.readUInt32BE(0);
        if (length > 65_536) {
          socket.destroy();
          return;
        }
        if (pending.length < length + 4) return;
        pending = pending.subarray(4);
        if (length === 0) {
          if (response !== null) {
            socket.end(Buffer.from(response + '\0', 'utf8'));
          } else {
            socket.end();
          }
          return;
        }
        received.push(Buffer.from(pending.subarray(0, length)));
        pending = pending.subarray(length);
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  return {
    socketPath,
    server,
    received,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

describe('ZFILES-R2-03B1 ClamAV INSTREAM isolated lab', () => {
  it('sends one z-framed stream of bounded bytes and accepts ONLY exact OK', async () => {
    const f = await clamdFixture('stream: OK');
    try {
      const bytes = Buffer.alloc(70_000, 42);
      const scanner = new ClamAvInstreamScanner(f.socketPath);
      expect(await scanner.scan(bytes)).toBe('CLAMD_OK_UNATTESTED');
      expect(Buffer.concat(f.received)).toEqual(bytes);
      expect(f.received.map((chunk) => chunk.length)).toEqual([65_536, 4_464]);
    } finally {
      await f.close();
    }
  });

  it('detects positive malware findings without exposing signature details', async () => {
    const f = await clamdFixture('stream: Eicar-Test-Signature FOUND');
    try {
      const verdict = await new ClamAvInstreamScanner(f.socketPath).scan(
        Buffer.from('synthetic-placeholder'),
      );
      expect(verdict).toBe('MALWARE_DETECTED');
    } finally {
      await f.close();
    }
  });

  it.each([
    'stream: size limit exceeded ERROR',
    'stream: WARNING',
    'stream: OK\n',
    'stream: OK ERROR',
    'stream: OK\0stream: OK',
  ])('rejects an unexpected or ambiguous engine reply: %s', async (reply) => {
    const f = await clamdFixture(reply);
    try {
      await expect(
        new ClamAvInstreamScanner(f.socketPath).scan(
          Buffer.from('synthetic-placeholder'),
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      await f.close();
    }
  });

  it('never interprets an OK-looking FOUND result as clean', async () => {
    const f = await clamdFixture('stream: OK FOUND');
    try {
      expect(
        await new ClamAvInstreamScanner(f.socketPath).scan(
          Buffer.from('synthetic-placeholder'),
        ),
      ).toBe('MALWARE_DETECTED');
    } finally {
      await f.close();
    }
  });

  it('fails closed if daemon disconnects without reporting a result', async () => {
    const f = await clamdFixture(null);
    try {
      await expect(
        new ClamAvInstreamScanner(f.socketPath).scan(Buffer.from('bytes')),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      await f.close();
    }
  });

  it('rejects malformed configuration and excessive data before opening socket', async () => {
    expect(() => new ClamAvInstreamScanner('tcp://127.0.0.1:3310')).toThrow(
      BadRequestException,
    );
    expect(() => new ClamAvInstreamScanner('/run/clamav/clamd.ctl', 0)).toThrow(
      BadRequestException,
    );
    const scanner = new ClamAvInstreamScanner('/nonexistent/zaping.sock');
    await expect(scanner.scan(Buffer.alloc(0))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      scanner.scan(Buffer.alloc(SUPPLIER_ATTACHMENT_MAX_BYTES + 1)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
