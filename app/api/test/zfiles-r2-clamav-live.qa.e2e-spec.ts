import {
  runZfilesR2ClamAvQa,
  ZFILES_SCAN_01F_QA_MANIFEST,
} from '../src/config/zfiles-r2-clamav-qa-harness';

/**
 * ZFILES-SCAN-01F2: one real QA fixture, read from R2 and sent to local clamd.
 * Never a production worker; never accepts a browser-supplied manifest.
 * Disabled by default. A real execution is forbidden inside GitHub Actions.
 */
const liveSuite =
  process.env.RUN_ZFILES_R2_CLAMAV_LIVE_QA === '1' ? describe : describe.skip;

liveSuite(
  'ZFILES-SCAN-01F2 real R2 + ClamAV (manual isolated Linux QA)',
  () => {
    it('verifies the pinned R2 object and scans only those bytes', async () => {
      if (
        process.platform !== 'linux' ||
        process.env.ZFILES_SCAN_01F2_REVIEWED !== '1' ||
        process.env.CI !== undefined ||
        process.env.GITHUB_ACTIONS !== undefined ||
        process.env.TZ !== 'UTC' ||
        Object.keys(process.env).some((name) =>
          /^(?:AWS_|CLOUDFLARE_)/u.test(name),
        )
      ) {
        throw new Error('ZFILES-SCAN-01F2 requires reviewed isolated Linux QA');
      }

      expect(ZFILES_SCAN_01F_QA_MANIFEST.sizeBytes).toBe(73);
      expect(ZFILES_SCAN_01F_QA_MANIFEST.sha256).toBe(
        'db8d51154a91568c291fe1e84c8fe9d56ebe858742b41dfea8419ab266eec679',
      );
      expect(ZFILES_SCAN_01F_QA_MANIFEST.etag).toBe(
        '"b9f6aafd18e3e5fe4dc37577f4b2c124"',
      );

      // This call uses the real conditional R2 GET, size/SHA-256 validation,
      // real socket-based PING/VERSION, INSTREAM, and post-scan readiness.
      const verdict = await runZfilesR2ClamAvQa(process.env);
      expect(verdict).toBe('CLAMD_OK_UNATTESTED');
    }, 60_000);
  },
);
