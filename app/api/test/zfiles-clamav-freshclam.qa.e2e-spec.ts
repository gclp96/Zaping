import { ServiceUnavailableException } from '@nestjs/common';
import {
  ClamAvReadinessProbe,
  type ClamAvReadiness,
  type ClamAvReadinessPolicy,
} from '../src/config/zfiles-clamav-readiness-lab';
import { ClamAvInstreamScanner } from '../src/config/zfiles-clamav-instream-lab';

/**
 * Opt-in real FreshClam/clamd QA. This is NOT a scan attestation, and it never
 * authorizes AVAILABLE. Only an isolated Linux GitHub Actions job may enable it.
 */
const describeReal =
  process.env.RUN_ZFILES_FRESHCLAM_REAL_QA === '1' ? describe : describe.skip;

const SOCKET = '/run/zaping-clamd/clamd.sock';
const HOUR = 60 * 60 * 1_000;
const policy: ClamAvReadinessPolicy = {
  policyVersion: 'zfiles-scan-01c2-qa-v1',
  daemonTimeZone: 'UTC',
  allowedEngineVersions: ['1.5.4'],
  maxDatabaseAgeMs: 48 * HOUR,
  maxFutureClockSkewMs: 5 * 60 * 1_000,
};

const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
  'ascii',
);
const jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9,
]);

describeReal('ZFILES-SCAN-01C2 real FreshClam and ClamAV QA', () => {
  const readiness = new ClamAvReadinessProbe(SOCKET, policy);
  const scanner = new ClamAvInstreamScanner(SOCKET, 15_000);
  let first: ClamAvReadiness | undefined;

  beforeAll(async () => {
    if (
      process.platform !== 'linux' ||
      process.env.CI !== 'true' ||
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.TZ !== 'UTC' ||
      process.env.CLAMD_SOCKET !== SOCKET ||
      process.env.ZFILES_FRESHCLAM_ONE_SHOT_EXIT_OK_QA !== '1' ||
      Object.keys(process.env).some((key) =>
        /^(?:R2_|AWS_|CLOUDFLARE_)/u.test(key),
      )
    ) {
      throw new Error('FreshClam QA requires a credential-free Linux runner');
    }
    // Uses the actual UTC wall clock and daemon VERSION, never a test date.
    first = await readiness.check();
  });

  afterAll(async () => {
    if (!first) return;
    const last = await readiness.check();
    expect(last.engineVersion).toBe(first.engineVersion);
    expect(last.databaseVersion).toBe(first.databaseVersion);
    expect(last.databaseBuiltAt).toBe(first.databaseBuiltAt);
    expect(last.attested).toBe(false);
  });

  it('accepts only pinned engine with signatures dated within 48 hours', async () => {
    const observed = await readiness.check();
    expect(observed.engineVersion).toBe('1.5.4');
    expect(observed.databaseVersion).toBeGreaterThan(0);
    expect(observed.policyVersion).toBe(policy.policyVersion);
    expect(observed.attested).toBe(false);
    expect(Date.parse(observed.databaseBuiltAt)).toBeGreaterThanOrEqual(
      Date.now() - policy.maxDatabaseAgeMs - 5_000,
    );
  });

  it('labels synthetic PDF and JPEG responses UNATTESTED', async () => {
    const before = await readiness.check();
    expect(await scanner.scan(pdf)).toBe('CLAMD_OK_UNATTESTED');
    expect(await scanner.scan(jpeg)).toBe('CLAMD_OK_UNATTESTED');
    const after = await readiness.check();
    expect(after.databaseVersion).toBe(before.databaseVersion);
    expect(after.databaseBuiltAt).toBe(before.databaseBuiltAt);
    expect(after.attested).toBe(false);
  });

  it('detects standard synthetic EICAR bytes as malware', async () => {
    const eicar = Buffer.from(
      'X5O!P%@AP[4' +
        String.fromCharCode(92) +
        'PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      'ascii',
    );
    expect(eicar.length).toBe(68);
    expect(await scanner.scan(eicar)).toBe('MALWARE_DETECTED');
  });

  it('rejects signatures older than the age limit using a test clock', async () => {
    const observed = await readiness.check();
    const afterExpiry = Date.parse(observed.databaseBuiltAt) + 49 * HOUR;
    await expect(readiness.check(afterExpiry)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed when the daemon socket is absent', async () => {
    const absent = '/run/zaping-clamd/missing-clamd.sock';
    await expect(
      new ClamAvReadinessProbe(absent, policy, 1_000).check(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      new ClamAvInstreamScanner(absent, 1_000).scan(Buffer.from('synthetic')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
