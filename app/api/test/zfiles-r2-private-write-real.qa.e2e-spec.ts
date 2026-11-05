import { runZfilesR2PrivateRealQa } from '../src/config/zfiles-r2-private-write-real-qa';

const describeLocal =
  process.env.RUN_ZFILES_R2_03D3B_REAL_QA === '1' &&
  process.env.CI !== 'true' &&
  process.env.GITHUB_ACTIONS !== 'true'
    ? describe
    : describe.skip;

/**
 * Explicit opt-in local Cloudflare R2 QA ONLY. A temporary synthetic
 * signature is not a real ClamAV scan or authorization to change PostgreSQL.
 * Never passes credentials, object keys or SDK errors into the Jest output.
 */
describeLocal('ZFILES-R2-03D3B physical storage create-once / recovery QA', () => {
  it('verifies synthetic private bytes without releasing an attachment', async () => {
    await runZfilesR2PrivateRealQa(process.env);
  }, 90_000);
});
