import {
  createZfilesR2QaReadClient,
  verifyZfilesR2QaObject,
} from '../src/config/zfiles-r2-qa-read';

const describeQa =
  process.env.RUN_CLOUDFLARE_R2_QA_SMOKE === '1' ? describe : describe.skip;

/**
 * Optional, local-only network smoke test. Must NEVER run in CI or with
 * production documents. No writes, database operations, or HTTP controllers.
 */
describeQa('ZFILES-R2-02B private QA read-only smoke', () => {
  it('lists and verifies one exact synthetic object', async () => {
    const { client, fixture } = createZfilesR2QaReadClient(process.env);
    try {
      await verifyZfilesR2QaObject(client, fixture);
    } catch {
      // No key, credentials, or SDK error details in the public QA result.
      throw new Error('R2 QA read-only smoke failed: check local QA setup');
    } finally {
      client.destroy();
    }
  }, 45_000);
});
