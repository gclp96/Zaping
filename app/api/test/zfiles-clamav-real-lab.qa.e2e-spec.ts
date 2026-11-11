import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createConnection } from 'node:net';
import { ClamAvInstreamScanner } from '../src/config/zfiles-clamav-instream-lab';

/**
 * ZFILES-SCAN-01A. Real clamd QA only; a clean protocol reply is UNATTESTED.
 * Default Jest E2E execution skips this suite. It never touches R2, SQL or HTTP.
 */
const describeReal =
  process.env.RUN_ZFILES_CLAMAV_REAL_QA === '1' ? describe : describe.skip;

const SOCKET = '/run/zaping-clamd/clamd.sock';

function daemonCommand(command: 'PING' | 'VERSION'): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path: SOCKET });
    let finished = false;
    let reply = Buffer.alloc(0);
    const timer = setTimeout(
      () => finish(new Error('ClamAV unavailable')),
      5_000,
    );

    function finish(result: string | Error): void {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      if (result instanceof Error) reject(result);
      else resolve(result);
    }

    socket.on('error', () => finish(new Error('ClamAV unavailable')));
    socket.on('close', () => finish(new Error('ClamAV connection closed')));
    socket.on('data', (chunk: Buffer) => {
      reply = Buffer.concat([reply, chunk]);
      if (reply.length > 512) {
        finish(new Error('ClamAV response too long'));
        return;
      }
      const terminator = reply.indexOf(0);
      if (terminator < 0) return;
      if (terminator !== reply.length - 1) {
        finish(new Error('Malformed ClamAV response'));
        return;
      }
      finish(reply.subarray(0, terminator).toString('utf8'));
    });
    socket.once('connect', () => {
      socket.write(Buffer.from(`z${command}\0`, 'ascii'), (error) => {
        if (error) finish(new Error('ClamAV command failed'));
      });
    });
  });
}

async function requireRealReadiness(): Promise<string> {
  if ((await daemonCommand('PING')) !== 'PONG') {
    throw new Error('ClamAV PING failed');
  }
  const version = await daemonCommand('VERSION');
  if (!/^ClamAV \d+\.\d+\.\d+\/[1-9]\d*\/[^\r\n\0]{5,120}$/u.test(version)) {
    throw new Error('ClamAV VERSION response invalid');
  }
  return version;
}

describeReal('ZFILES-SCAN-01A isolated real ClamAV', () => {
  const scanner = new ClamAvInstreamScanner(SOCKET, 15_000);
  let versionBefore: string | undefined;

  beforeAll(async () => {
    if (
      process.platform !== 'linux' ||
      process.env.CI !== 'true' ||
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.TZ !== 'UTC' ||
      process.env.CLAMD_SOCKET !== SOCKET ||
      Object.keys(process.env).some((name) =>
        /^(?:R2_|AWS_|CLOUDFLARE_)/u.test(name),
      )
    ) {
      throw new Error(
        'Only credential-free isolated Linux CI may run real ClamAV QA',
      );
    }
    versionBefore = await requireRealReadiness();
  });

  afterAll(async () => {
    if (versionBefore) {
      expect(await requireRealReadiness()).toBe(versionBefore);
    }
  });

  it('returns UNATTESTED for clean synthetic PDF and JPEG', async () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
      'ascii',
    );
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff,
      0xd9,
    ]);
    expect(await scanner.scan(pdf)).toBe('CLAMD_OK_UNATTESTED');
    expect(await scanner.scan(jpeg)).toBe('CLAMD_OK_UNATTESTED');
  });

  it('detects synthetic EICAR without disclosing the signature name', async () => {
    // Construct at runtime; no test-virus file or literal signature is stored.
    const eicar = Buffer.from(
      'X5O!P%@AP[4' +
        String.fromCharCode(92) +
        'PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      'ascii',
    );
    expect(eicar.length).toBe(68);
    expect(await scanner.scan(eicar)).toBe('MALWARE_DETECTED');
  });

  it('fails closed when clamd is not reachable', async () => {
    await expect(
      new ClamAvInstreamScanner(
        '/run/zaping-clamd/missing-scanner.sock',
        1_000,
      ).scan(Buffer.from('synthetic')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('enforces byte limits before accepting an INSTREAM request', async () => {
    await expect(scanner.scan(Buffer.alloc(0))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      scanner.scan(Buffer.alloc(10 * 1024 * 1024 + 1)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
