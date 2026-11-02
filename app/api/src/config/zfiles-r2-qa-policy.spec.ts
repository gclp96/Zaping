import { requireZfilesR2QaFixture } from './zfiles-r2-qa-policy';

const companyId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const attachmentId = '33333333-3333-4333-8333-333333333333';
const objectKey = `private/${companyId}/${documentId}/${attachmentId}`;
const accountId = 'a'.repeat(32);
const defaults: NodeJS.ProcessEnv = {
  RUN_CLOUDFLARE_R2_QA_SMOKE: '1',
  R2_ACCOUNT_ID: accountId,
  R2_JURISDICTION: 'default',
  R2_PRIVATE_BUCKET: 'zaping-private-qa',
  R2_QUARANTINE_BUCKET: 'zaping-quarantine-qa',
  R2_QA_FIXTURE_COMPANY_ID: companyId,
  R2_QA_FIXTURE_OBJECT_KEY: objectKey,
  R2_QA_FIXTURE_SIZE_BYTES: '64',
  R2_QA_FIXTURE_SHA256: 'b'.repeat(64),
};

function inspect(patch: NodeJS.ProcessEnv = {}) {
  return requireZfilesR2QaFixture({ ...defaults, ...patch });
}

describe('ZFILES-R2-02A QA-only R2 fixture policy', () => {
  it('accepts an exact private QA fixture without credentials', () => {
    expect(inspect()).toEqual({
      accountId,
      jurisdiction: 'default',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      privateBucket: 'zaping-private-qa',
      quarantineBucket: 'zaping-quarantine-qa',
      companyId,
      objectKey,
      sizeBytes: 64,
      sha256: 'b'.repeat(64),
    });
  });

  it('derives supported jurisdiction endpoints without an input URL', () => {
    expect(inspect({ R2_JURISDICTION: 'us' }).endpoint).toBe(
      `https://${accountId}.us.r2.cloudflarestorage.com`,
    );
    expect(inspect({ R2_JURISDICTION: 'eu' }).endpoint).toBe(
      `https://${accountId}.eu.r2.cloudflarestorage.com`,
    );
  });

  it.each([
    { RUN_CLOUDFLARE_R2_QA_SMOKE: '0' },
    { RUN_CLOUDFLARE_R2_QA_SMOKE: '' },
    { CI: 'true' },
    { GITHUB_ACTIONS: 'true' },
    { R2_PRIVATE_BUCKET: 'zaping-private-prod' },
    { R2_PRIVATE_BUCKET: 'zaping-quarantine-qa' },
    { R2_QUARANTINE_BUCKET: 'zaping-quarantine-prod' },
    { R2_ACCOUNT_ID: 'not-an-account' },
    { R2_ACCOUNT_ID: 'A'.repeat(32) },
    { R2_JURISDICTION: 'other' },
    { R2_QA_FIXTURE_COMPANY_ID: documentId },
    { R2_QA_FIXTURE_COMPANY_ID: 'not-uuid' },
    { R2_QA_FIXTURE_OBJECT_KEY: `quarantine/${objectKey}` },
    { R2_QA_FIXTURE_OBJECT_KEY: 'https://example.invalid/a.pdf' },
    { R2_QA_FIXTURE_OBJECT_KEY: `${objectKey}/../evil` },
    { R2_QA_FIXTURE_OBJECT_KEY: `private/${documentId}/${documentId}/${attachmentId}` },
    { R2_QA_FIXTURE_OBJECT_KEY: `${objectKey} ` },
    { R2_QA_FIXTURE_SIZE_BYTES: '0' },
    { R2_QA_FIXTURE_SIZE_BYTES: '1e3' },
    { R2_QA_FIXTURE_SIZE_BYTES: '10485761' },
    { R2_QA_FIXTURE_SHA256: 'invalid' },
    { R2_QA_FIXTURE_SHA256: 'B'.repeat(64) },
  ])('rejects unsafe fixture/configuration %j', (patch) => {
    expect(() => inspect(patch)).toThrow();
  });

  it('never includes credentials or private keys in failures', () => {
    const secret = 'synthetic-test-only-secret-never-a-real-key';
    try {
      inspect({
        R2_QA_FIXTURE_SHA256: 'invalid',
        R2_READ_SECRET_ACCESS_KEY: secret,
      });
      throw new Error('Expected validation to reject invalid digest');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      expect(message).not.toContain(secret);
      expect(message).not.toContain(objectKey);
    }
  });
});
