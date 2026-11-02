import {
  SUPPLIER_ATTACHMENT_MAX_BYTES,
} from '../supplier-documents/supplier-document-attachment-validation';

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_PATTERN = new RegExp(`^${UUID}$`);
const KEY_PATTERN = new RegExp(`^private/(${UUID})/(${UUID})/(${UUID})$`);
const ALLOWED_JURISDICTIONS = new Set([
  'default',
  'eu',
  'us',
  'fedramp',
  'fedramp-high',
]);

export type ZfilesR2QaFixture = {
  accountId: string;
  jurisdiction: string;
  endpoint: string;
  region: 'auto';
  privateBucket: 'zaping-private-qa';
  quarantineBucket: 'zaping-quarantine-qa';
  companyId: string;
  objectKey: string;
  sizeBytes: number;
  sha256: string;
};

/**
 * Pure, network-free safety gate for a future explicitly authorized R2 QA
 * read-only smoke test. Never verifies actual token privileges or bucket ACLs.
 * It returns no access keys, secrets or credentials.
 */
export function requireZfilesR2QaFixture(
  env: NodeJS.ProcessEnv,
): ZfilesR2QaFixture {
  if (env.RUN_CLOUDFLARE_R2_QA_SMOKE !== '1') {
    throw new Error('R2 QA smoke requires explicit local opt-in');
  }
  if (env.CI === 'true' || env.GITHUB_ACTIONS === 'true') {
    throw new Error('R2 QA live probe must not run inside CI');
  }

  const accountId = env.R2_ACCOUNT_ID ?? '';
  const privateBucket = env.R2_PRIVATE_BUCKET ?? '';
  const quarantineBucket = env.R2_QUARANTINE_BUCKET ?? '';
  const jurisdiction = env.R2_JURISDICTION ?? 'default';
  if (!/^[0-9a-f]{32}$/.test(accountId)) {
    throw new Error('R2 QA Account ID is invalid');
  }
  if (
    privateBucket !== 'zaping-private-qa' ||
    quarantineBucket !== 'zaping-quarantine-qa'
  ) {
    throw new Error('R2 QA requires two exact private QA bucket names');
  }
  if (!ALLOWED_JURISDICTIONS.has(jurisdiction)) {
    throw new Error('R2 QA jurisdiction is unsupported');
  }

  const companyId = env.R2_QA_FIXTURE_COMPANY_ID ?? '';
  const objectKey = env.R2_QA_FIXTURE_OBJECT_KEY ?? '';
  const rawSize = env.R2_QA_FIXTURE_SIZE_BYTES ?? '';
  const sha256 = env.R2_QA_FIXTURE_SHA256 ?? '';
  if (!UUID_PATTERN.test(companyId)) {
    throw new Error('R2 QA Company ID is invalid');
  }
  const match = KEY_PATTERN.exec(objectKey);
  if (!match || match[1] !== companyId) {
    throw new Error('R2 QA object key must belong to its Company');
  }
  if (!/^[1-9][0-9]*$/.test(rawSize)) {
    throw new Error('R2 QA object size is invalid');
  }
  const sizeBytes = Number(rawSize);
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes > SUPPLIER_ATTACHMENT_MAX_BYTES
  ) {
    throw new Error('R2 QA object exceeds attachment size limits');
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('R2 QA fixture SHA-256 is invalid');
  }
  const prefix = jurisdiction === 'default' ? '' : `${jurisdiction}.`;
  return {
    accountId,
    jurisdiction,
    endpoint: `https://${accountId}.${prefix}r2.cloudflarestorage.com`,
    region: 'auto',
    privateBucket: 'zaping-private-qa',
    quarantineBucket: 'zaping-quarantine-qa',
    companyId,
    objectKey,
    sizeBytes,
    sha256,
  };
}
