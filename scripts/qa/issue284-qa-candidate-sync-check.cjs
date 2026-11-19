'use strict';

/**
 * Issue #284 — READ-ONLY drift gate for staged QA candidate and rollback.
 * Unlike issue284-cutover-preflight, this intentionally REQUIRES the
 * candidate database to exist. No migrations, mutations or config changes.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  officialInventoryQuery, allFingerprintsQuery, verifyTableFingerprints,
} = require('./issue284-cutover-preflight.cjs');

const ORIGINAL = 'zaping_qa';
const CANDIDATE = 'zaping_qa_official_candidate_v1';
const R2 = '20261113190000_zaping_files_r2_v1';
function run(args) {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000,
      maxBuffer: 3 * 1024 * 1024,
    }).trim();
  } catch (e) {
    throw new Error('STOP: QA read-only check failed (' + (e.status ?? 'unknown') + ')');
  }
}
function qaContainer() {
  const ids = run([
    'ps', '-q',
    '--filter', 'label=com.docker.compose.project=zaping-local-qa',
    '--filter', 'label=com.docker.compose.service=zaping-qa-postgres',
  ]).split(/\r?\n/).filter(Boolean);
  assert.equal(ids.length, 1, 'STOP: expected one operational QA PostgreSQL');
  assert.match(ids[0], /^[a-f0-9]{12,64}$/);
  const project = run(['inspect', '--format',
    '{{index .Config.Labels "com.docker.compose.project"}}', ids[0]]);
  const service = run(['inspect', '--format',
    '{{index .Config.Labels "com.docker.compose.service"}}', ids[0]]);
  assert.equal(project, 'zaping-local-qa', 'STOP: unexpected project');
  assert.equal(service, 'zaping-qa-postgres', 'STOP: unexpected service');
  return ids[0];
}
function sql(id, db, q) {
  return run([
    'exec', '--env', 'PGOPTIONS=-c default_transaction_read_only=on',
    id, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1',
    '-U', 'zaping_qa', '-d', db, '-c', q,
  ]);
}
function migrationNames(id, db) {
  return sql(id, db, 'SELECT migration_name FROM public._prisma_migrations ' +
    'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;')
    .split(/\r?\n/).filter(Boolean);
}
function compare() {
  const id = qaContainer();
  assert.equal(sql(id, ORIGINAL, 'SELECT current_database(),current_user;'),
    ORIGINAL + '|zaping_qa');
  assert.equal(sql(id, CANDIDATE, 'SELECT current_database(),current_user;'),
    CANDIDATE + '|zaping_qa');
  const a = migrationNames(id, ORIGINAL), b = migrationNames(id, CANDIDATE);
  assert.equal(a.length, 55, 'STOP: original QA migration count drift');
  assert.equal(b.length, 54, 'STOP: official candidate migration count drift');
  assert.deepEqual(a.filter(m => m !== R2), b,
    'STOP: migrations differ beyond historical R2');
  assert.equal(a.filter(m => m === R2).length, 1,
    'STOP: historical R2 not found exactly once');
  const tableR2 = "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public' " +
    "AND tablename IN ('ZapingFile','ZapingFileReceiptLink','ZapingFileEvent');";
  assert.equal(sql(id, ORIGINAL, tableR2), '3', 'STOP: historical R2 objects changed');
  assert.equal(sql(id, CANDIDATE, tableR2), '0', 'STOP: candidate contains R2 objects');
  const namesA = sql(id, ORIGINAL, officialInventoryQuery()).split(/\r?\n/).filter(Boolean);
  const namesB = sql(id, CANDIDATE, officialInventoryQuery()).split(/\r?\n/).filter(Boolean);
  assert.deepEqual(namesA, namesB, 'STOP: official table inventory drift');
  const statement = allFingerprintsQuery(namesA);
  verifyTableFingerprints(sql(id, ORIGINAL, statement), sql(id, CANDIDATE, statement));
  console.log('PASS: original and staged candidate contain 110 matching rows across 57 tables');
  console.log('PASS: original has 55 migrations including R2; candidate has 54 and no R2 tables');
  console.log('HOLD: read-only sync check did not start/stop services or change data/config');
}
if (require.main === module) {
  try { compare(); }
  catch (e) {
    console.error(e instanceof Error && e.message.startsWith('STOP:')
      ? e.message : 'STOP: database snapshots differ or expected QA identity missing');
    process.exitCode = 1;
  }
}
module.exports = { ORIGINAL, CANDIDATE };
