import {
  requireZfilesR2PrivateQaConfig,
  ZfilesR2PrivateQaSafeError,
} from './zfiles-r2-private-write-real-qa';

const company = 'cfa25b27-8779-4d1b-a066-eb04a54e741e';
const document = '31636504-44e2-42df-b4b1-07e141e42b9c';
const attachment = '3d99300c-b285-419b-87eb-c3e61323769d';

function qaEnv(): NodeJS.ProcessEnv {
  return {
    RUN_ZFILES_R2_03D3B_REAL_QA: '1',
    CI: 'false',
    GITHUB_ACTIONS: 'false',
    NODE_ENV: 'test',
    R2_PROMOTER_QA_SYNTHETIC_ONLY_CONFIRMED: '1',
    R2_SCANNER_QA_READ_ONLY_CONFIRMED: '1',
    R2_PROMOTER_QA_PRIVATE_SCOPE_CONFIRMED: '1',
    R2_PROMOTER_QA_CREATE_ONCE_APPROVED: '1',
    R2_QUARANTINE_BUCKET: 'zaping-quarantine-qa',
    R2_PRIVATE_BUCKET: 'zaping-private-qa',
    R2_PROMOTER_QA_MODE: 'CREATE_ONCE',
    R2_ACCOUNT_ID: 'a'.repeat(32),
    R2_JURISDICTION: 'default',
    R2_QUARANTINE_SCAN_COMPANY_ID: company,
    R2_QUARANTINE_SCAN_DOCUMENT_ID: document,
    R2_QUARANTINE_SCAN_ATTACHMENT_ID: attachment,
    R2_QUARANTINE_SCAN_SHA256: 'b'.repeat(64),
    R2_QUARANTINE_SCAN_SIZE_BYTES: '110',
    R2_PROMOTER_QA_LOCAL_ORIGINAL_PDF:
      `C:\\QA\\quarantine_${company}_${document}_${attachment}.pdf`,
    R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID: 'synthetic-quarantine-id',
    R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY: 'synthetic-q-secret',
    R2_PROMOTER_QA_PRIVATE_ACCESS_KEY_ID: 'synthetic-private-id',
    R2_PROMOTER_QA_PRIVATE_SECRET_ACCESS_KEY: 'synthetic-p-secret',
  };
}

describe('ZFILES-R2-03D3B local QA configuration guard (offline)', () => {
  it('accepts only fully scoped synthetic QA with distinct identities', () => {
    const r = requireZfilesR2PrivateQaConfig(qaEnv());
    expect(r.mode).toBe('CREATE_ONCE');
    expect(r.sizeBytes).toBe(110);
    expect(r.endpoint).toBe(
      `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
    );
  });

  it('supports explicitly selected existing-object recovery without write approval', () => {
    const r = requireZfilesR2PrivateQaConfig({
      ...qaEnv(),
      R2_PROMOTER_QA_MODE: 'RECOVER_EXISTING',
      R2_PROMOTER_QA_CREATE_ONCE_APPROVED: undefined,
    });
    expect(r.mode).toBe('RECOVER_EXISTING');
  });

  it('rejects CI, production, absent opt-in, and an unapproved write', () => {
    const base = qaEnv();
    for (const override of [
      { CI: 'true' },
      { GITHUB_ACTIONS: 'true' },
      { NODE_ENV: 'production' },
      { RUN_ZFILES_R2_03D3B_REAL_QA: undefined },
      { R2_PROMOTER_QA_CREATE_ONCE_APPROVED: undefined },
      { R2_PROMOTER_QA_PRIVATE_SCOPE_CONFIRMED: undefined },
      { R2_PROMOTER_QA_SYNTHETIC_ONLY_CONFIRMED: undefined },
      { R2_SCANNER_QA_READ_ONLY_CONFIRMED: undefined },
      { R2_PROMOTER_QA_MODE: 'UNKNOWN' },
    ]) {
      expect(() =>
        requireZfilesR2PrivateQaConfig({ ...base, ...override }),
      ).toThrow(ZfilesR2PrivateQaSafeError);
    }
  });

  it('rejects other buckets, invalid identity/manifest and key reuse', () => {
    const base = qaEnv();
    for (const override of [
      { R2_PRIVATE_BUCKET: 'zaping-private-prod' },
      { R2_QUARANTINE_BUCKET: 'zaping-quarantine-prod' },
      { R2_QUARANTINE_SCAN_COMPANY_ID: 'not-a-uuid' },
      { R2_QUARANTINE_SCAN_SHA256: 'B'.repeat(64) },
      { R2_QUARANTINE_SCAN_SIZE_BYTES: '0' },
      { R2_QUARANTINE_SCAN_SIZE_BYTES: '10485761' },
      { R2_ACCOUNT_ID: 'a'.repeat(31) },
      { R2_PROMOTER_QA_LOCAL_ORIGINAL_PDF: 'C:\\QA\\other.pdf' },
      { R2_PROMOTER_QA_LOCAL_ORIGINAL_PDF: 'relative.pdf' },
      { R2_PROMOTER_QA_PRIVATE_ACCESS_KEY_ID: 'synthetic-quarantine-id' },
      { R2_READ_ACCESS_KEY_ID: 'synthetic-private-id' },
      { R2_QUARANTINE_WRITE_ACCESS_KEY_ID: 'synthetic-quarantine-id' },
    ]) {
      expect(() =>
        requireZfilesR2PrivateQaConfig({ ...base, ...override }),
      ).toThrow(ZfilesR2PrivateQaSafeError);
    }
  });

  it('never includes an access key in its setup error', () => {
    try {
      requireZfilesR2PrivateQaConfig({
        ...qaEnv(),
        R2_PROMOTER_QA_PRIVATE_SCOPE_CONFIRMED: undefined,
      });
      throw new Error('expected fail closed');
    } catch (err) {
      expect(String(err)).toContain('NOT VERIFIED [CONFIG]');
      expect(String(err)).not.toContain('synthetic-p-secret');
      expect(String(err)).not.toContain('synthetic-private-id');
    }
  });
});
