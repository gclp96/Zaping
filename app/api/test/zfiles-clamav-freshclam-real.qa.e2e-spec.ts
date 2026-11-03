import { ServiceUnavailableException } from '@nestjs/common';
import {
  ClamAvReadinessProbe,
  type ClamAvReadiness,
  type ClamAvReadinessPolicy,
} from '../src/config/zfiles-clamav-readiness-lab';
import { ClamAvInstreamScanner } from '../src/config/zfiles-clamav-instream-lab';

/**
 * Opt-in GitHub Actions lab ONLY, requiring a previous successful FreshClam step.
 * No R2/DB and no production attestation or AVAILABLE transition.
 */
const describeLive =
  process.env.RUN_ZFILES_CLAMAV_FRESH_REAL_QA === '1'
    ? describe
    : describe.skip;

const SOCKET_PATH = '/run/zaping-clamd/clamd.sock';
const HOUR_MS = 60 * 60 * 1_000;
const MAX_AGE_MS = 48 * HOUR_MS;

const policy: ClamAvReadinessPolicy = {
  policyVersion: 'zfiles-b5-real-qa-v1',
  daemonTimeZone: 'UTC',
  allowedEngineVersions: ['1.5.4'],
  maxDatabaseAgeMs: MAX_AGE_MS,
  maxFutureClockSkewMs: 5 * 60 * 1_000,
};

describeLive('ZFILES-R2-03B5 real FreshClam/ClamAV isolated lab', () => {
  const readiness = new ClamAvReadinessProbe(SOCKET_PATH, policy);
  const scanner = new ClamAvInstreamScanner(SOCKET_PATH);
  let initial: ClamAvReadiness | undefined;

  beforeAll(async () => {
    if (
      process.platform !== 'linux' ||
      process.env.CI !== 'true' ||
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.TZ !== 'UTC' ||
      process.env.RUN_ZFILES_CLAMAV_FRESH_REAL_QA !== '1' ||
      process.env.ZFILES_FRESHCLAM_UPDATED_DB_QA !== '1' ||
      process.env.CLAMD_SOCKET !== SOCKET_PATH ||
      Object.keys(process.env).some((name) =>
        /^(?:R2_|AWS_|CLOUDFLARE_)/u.test(name),
      )
    ) {
      throw new Error('FreshClam lab requires isolated credential-free CI');
    }
    // check() uses the actual wall clock; no synthetic evaluation time.
    initial = await readiness.check();
  });

  afterAll(async () => {
    if (!initial) return;
    const last = await readiness.check();
    expect(last.engineVersion).toBe(initial.engineVersion);
    expect(last.databaseVersion).toBe(initial.databaseVersion);
    expect(last.databaseBuiltAt).toBe(initial.databaseBuiltAt);
    expect(last.policyVersion).toBe(initial.policyVersion);
    expect(last.attested).toBe(false);
  });

  it('reports a strictly allowed engine and recent signatures against UTC now', async () => {
    const before = Date.now();
    const observed = await readiness.check();
    const after = Date.now();
    const databaseBuiltAtMs = Date.parse(observed.databaseBuiltAt);
    expect(observed.engineVersion).toBe('1.5.4');
    expect(observed.databaseVersion).toBeGreaterThan(0);
    expect(observed.attested).toBe(false);
    expect(databaseBuiltAtMs).toBeGreaterThanOrEqual(
      before - MAX_AGE_MS - 5_000,
    );
    expect(databaseBuiltAtMs).toBeLessThanOrEqual(
      after + policy.maxFutureClockSkewMs,
    );
  });

  it('scans only synthetic PDF/JPEG bytes and retains UNATTESTED verdicts', async () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
      'ascii',
    );
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff,
      0xd9,
    ]);
    const before = await readiness.check();
    expect(await scanner.scan(pdf)).toBe('CLAMD_OK_UNATTESTED');
    expect(await scanner.scan(jpeg)).toBe('CLAMD_OK_UNATTESTED');
    const after = await readiness.check();
    expect(after.engineVersion).toBe(before.engineVersion);
    expect(after.databaseVersion).toBe(before.databaseVersion);
    expect(after.databaseBuiltAt).toBe(before.databaseBuiltAt);
    expect(after.attested).toBe(false);
  });

  it('detects the harmless EICAR test signature without publishing its name', async () => {
    const eicar = Buffer.from(
      'X5O!P%@AP[4' +
        String.fromCharCode(92) +
        'PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      'ascii',
    );
    expect(eicar.length).toBe(68);
    const before = await readiness.check();
    expect(await scanner.scan(eicar)).toBe('MALWARE_DETECTED');
    const after = await readiness.check();
    expect(after.databaseVersion).toBe(before.databaseVersion);
    expect(after.attested).toBe(false);
  });

  it('fails closed for an expired database using a deliberately advanced test clock', async () => {
    const observed = await readiness.check();
    const expiredAtMs = Date.parse(observed.databaseBuiltAt) + 49 * HOUR_MS;
    await expect(readiness.check(expiredAtMs)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed when the local daemon socket does not exist', async () => {
    const missing = '/run/zaping-clamd/does-not-exist.sock';
    await expect(
      new ClamAvReadinessProbe(missing, policy, 1_000).check(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      new ClamAvInstreamScanner(missing, 1_000).scan(Buffer.from('synthetic')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
