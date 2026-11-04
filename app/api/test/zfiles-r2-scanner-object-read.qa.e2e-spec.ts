import {
  createScannerObjectReadQaClient,
  verifyScannerObjectReadQaScope,
} from '../src/config/zfiles-r2-scanner-object-read-qa';

const describeQa =
  process.env.RUN_ZFILES_R2_SCANNER_OBJECT_READ_QA === '1'
    ? describe
    : describe.skip;

/**
 * Local-only Cloudflare R2, with one real scoped Object Read credential and
 * TWO verified synthetic fixtures. Does not modify any object or use ClamAV.
 * This test is SKIPPED in GitHub Actions, even if its flag is accidentally set.
 */
describeQa('ZFILES-R2-03C3A real Object Read permission QA', () => {
  it('reads exact quarantine object and denies exact private QA HEAD', async () => {
    const { client, scope } = createScannerObjectReadQaClient(process.env);
    try {
      await verifyScannerObjectReadQaScope(client, scope);
    } catch {
      // No SDK errors, credentials, account IDs, object keys or signatures.
      throw new Error('ZFILES-R2-03C3A real QA NOT VERIFIED');
    } finally {
      client.destroy();
    }
  }, 45_000);
});
