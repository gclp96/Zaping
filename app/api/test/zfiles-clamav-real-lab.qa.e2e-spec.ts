import { ServiceUnavailableException } from '@nestjs/common';
import { createConnection } from 'node:net';
import { ClamAvInstreamScanner } from '../src/config/zfiles-clamav-instream-lab';

/**
 * Real clamd laboratory ONLY. The default API E2E suite skips this file.
 * A successful protocol response is NOT a clean-file attestation.
 */
const describeReal =
  process.env.RUN_ZFILES_CLAMAV_REAL_QA === '1' ? describe : describe.skip;

const SOCKET_PATH = '/run/zaping-clamd/clamd.sock';
const TIMEOUT_MS = 15_000;

function daemonCommand(command: 'PING' | 'VERSION'): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path: SOCKET_PATH });
    let settled = false;
    let reply = Buffer.alloc(0);
    const timer = setTimeout(() => finish(new Error('ClamAV not ready')), 5_000);

    function finish(value: string | Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (value instanceof Error) reject(value);
      else resolve(value);
    }

    socket.on('error', () => finish(new Error('ClamAV not ready')));
    socket.on('close', () => finish(new Error('ClamAV closed early')));
    socket.on('data', (chunk: Buffer) => {
      reply = Buffer.concat([reply, chunk]);
      if (reply.length > 512) {
        finish(new Error('ClamAV reply invalid'));
        return;
      }
      const terminator = reply.indexOf(0);
      if (terminator === -1) return;
      if (terminator !== reply.length - 1) {
        finish(new Error('ClamAV reply invalid'));
        return;
      }
      finish(reply.subarray(0, terminator).toString('utf8'));
    });
    socket.once('connect', () => {
      socket.write(Buffer.from('z' + command + '\0', 'ascii'), (error) => {
        if (error) finish(new Error('ClamAV command failed'));
      });
    });
  });
}

async function readiness(): Promise<string> {
  expect(await daemonCommand('PING')).toBe('PONG');
  const version = await daemonCommand('VERSION');
  if (!/^ClamAV \d+\.\d+\.\d+\/[1-9]\d*\/[^\r\n\0]{5,80}$/u.test(version)) {
    throw new Error('Unexpected ClamAV lab VERSION');
  }
  return version;
}

describeReal('ZFILES-R2-03B2 real ClamAV Unix INSTREAM lab', () => {
  let beforeVersion: string;
  const scanner = new ClamAvInstreamScanner(SOCKET_PATH, TIMEOUT_MS);

  beforeAll(async () => {
    if (
      process.platform !== 'linux' ||
      process.env.CI !== 'true' ||
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.TZ !== 'UTC' ||
      process.env.CLAMD_SOCKET !== SOCKET_PATH ||
      Object.keys(process.env).some((name) =>
        /^(?:R2_|AWS_|CLOUDFLARE_)/u.test(name),
      )
    ) {
      throw new Error('Real ClamAV QA requires isolated credential-free CI');
    }
    beforeVersion = await readiness();
  });

  afterAll(async () => {
    if (beforeVersion) {
      // Preloaded offline signatures: version consistency is not freshness.
      expect(await readiness()).toBe(beforeVersion);
    }
  });

  it('recognizes clean synthetic PDF and JPEG as UNATTESTED only', async () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
      'ascii',
    );
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
      0xff, 0xd9,
    ]);

    expect(await scanner.scan(pdf)).toBe('CLAMD_OK_UNATTESTED');
    expect(await scanner.scan(jpeg)).toBe('CLAMD_OK_UNATTESTED');
  });

  it('flags harmless EICAR test bytes as malware, never clean', async () => {
    // Assemble standard 68-byte test signature without storing an artifact.
    const eicar = Buffer.from(
      'X5O!P%@AP[4' +
        String.fromCharCode(92) +
        'PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      'ascii',
    );
    expect(eicar.length).toBe(68);
    expect(await scanner.scan(eicar)).toBe('MALWARE_DETECTED');
  });

  it('fails closed when the daemon socket is missing', async () => {
    const missing = new ClamAvInstreamScanner(
      '/run/zaping-clamd/zaping-nonexistent.sock',
      1_000,
    );
    await expect(missing.scan(Buffer.from('synthetic'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects empty and oversized input before scanner invocation', async () => {
    await expect(scanner.scan(Buffer.alloc(0))).rejects.toThrow();
    await expect(scanner.scan(Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toThrow();
  });
});
