import {
  createZfilesQuarantineQaClient,
  writeAndVerifyQuarantineQaFixture,
} from '../src/config/zfiles-r2-quarantine-qa';

/**
 * Local opt-in only. Never run with CI credentials or any real document.
 * This creates exactly one synthetic QA object and does not delete it.
 */
const describeQa =
  process.env.RUN_ZFILES_R2_QUARANTINE_QA_WRITE === '1'
    ? describe
    : describe.skip;

describeQa('ZFILES-R2-03A conditional quarantine QA write', () => {
  it('writes one new synthetic PDF and verifies its bytes', async () => {
    const { client, config } = createZfilesQuarantineQaClient(process.env);
    try {
      const result = await writeAndVerifyQuarantineQaFixture(client, config);
      expect(result.key.startsWith('quarantine/')).toBe(true);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    } catch {
      // Never expose credentials, bucket keys or SDK request details.
      throw new Error('R2 QA quarantine write failed; verify local QA scope');
    } finally {
      client.destroy();
    }
  }, 45_000);
});
