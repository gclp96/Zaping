'use strict';

/**
 * Issue #284 — opt-in preparation of a new official QA candidate DB.
 *
 * IMPORTANT: This script creates ONLY zaping_qa_official_candidate_v1 in
 * existing operational PostgreSQL. It never connects an API, edits .env files,
 * changes the original zaping_qa database, or removes an existing database.
 *
 * Requirements:
 *  - Both Docker Compose projects already running.
 *  - READ-ONLY preflight must PASS against unchanged v3 and operational QA.
 *  - No QA writers/transactions changing during the data transfer.
 *  - Explicit --prepare-candidate-v1 CLI opt-in.
 *
 * The source DB (54 official migrations, 110 rows, no R2) is exported as an
 * entire custom archive. The destination is a freshly created, distinct DB.
 * Preserve failed destinations as evidence; NEVER retry over an existing DB.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const {
  officialCountsQuery, coreCountsQuery, officialInventoryQuery,
  allFingerprintsQuery, verifyTableFingerprints,
  CANDIDATE,
} = require('./issue284-cutover-preflight.cjs');

const USER = 'zaping_qa';
const SERVICE = 'zaping-qa-postgres';
const QA_PROJECT = 'zaping-local-qa';
const REHEARSAL_PROJECT = 'zaping-issue284-rehearsal';
const SOURCE = 'zaping_issue284_transfer_trial_v3';
const ORIGINAL = 'zaping_qa';
const HISTORY_R2 = '20261113190000_zaping_files_r2_v1';
const ARG = '--prepare-candidate-v1';

function invoke(binary, args, opts = {}) {
  try {
    return execFileSync(binary, args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000, maxBuffer: 4 * 1024 * 1024, ...opts,
    }).trim();
  } catch (error) {
    // Do not print command arguments: they can include secrets or paths.
    throw new Error('STOP: isolated candidate preparation command failed (' +
      (error.status ?? 'unknown') + ')');
  }
}
function container(project) {
  const ids = invoke('docker', [
    'ps', '-q',
    '--filter', 'label=com.docker.compose.project=' + project,
    '--filter', 'label=com.docker.compose.service=' + SERVICE,
  ]).split(/\r?\n/).filter(Boolean);
  assert.equal(ids.length, 1, 'STOP: expected exactly one PostgreSQL for ' + project);
  const id = ids[0];
  assert.match(id, /^[a-f0-9]{12,64}$/, 'STOP: malformed Docker ID');
  const projectLabel = invoke('docker', ['inspect', '--format',
    '{{index .Config.Labels "com.docker.compose.project"}}', id]);
  const serviceLabel = invoke('docker', ['inspect', '--format',
    '{{index .Config.Labels "com.docker.compose.service"}}', id]);
  const name = invoke('docker', ['inspect', '--format', '{{.Name}}', id]);
  assert.equal(projectLabel, project, 'STOP: unexpected Docker project');
  assert.equal(serviceLabel, SERVICE, 'STOP: unexpected Docker service');
  assert.ok(name.startsWith('/' + project + '-' + SERVICE + '-'),
    'STOP: unexpected Docker container name');
  return id;
}
function readSql(id, database, query) {
  return invoke('docker', [
    'exec', '--env', 'PGOPTIONS=-c default_transaction_read_only=on',
    id, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', USER,
    '-d', database, '-c', query,
  ]);
}
function requireExactHistory(id, db, expectedCount) {
  const rows = readSql(id, db, "SELECT migration_name FROM public._prisma_migrations " +
    "WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;");
  const names = rows.split(/\r?\n/).filter(Boolean);
  assert.equal(names.length, expectedCount, 'STOP: migration count drift');
  assert.equal(names.includes(HISTORY_R2), expectedCount === 55,
    'STOP: R2 migration history drift');
  return names;
}
function assertCandidateAbsent(op) {
  const count = readSql(op, 'postgres',
    "SELECT count(*) FROM pg_database WHERE datname = '" + CANDIDATE + "';");
  assert.equal(count, '0', 'STOP: candidate already exists, never overwrite');
}
function validateArchiveList(output) {
  // A full dump must include _prisma_migrations and ALL official table data.
  const tableLines = output.split(/\r?\n/)
    .filter(x => /;\s+\d+\s+\d+\s+TABLE DATA public /.test(x));
  assert.equal(tableLines.length, 58, 'STOP: unexpected full-archive TABLE DATA objects');
  assert.ok(tableLines.some(x => /\bTABLE DATA public _prisma_migrations\s/.test(x)),
    'STOP: missing official Prisma migration history');
  for (const name of ['Company', 'Customer', 'Purchase', 'PurchaseReceipt', 'HealthcareCase']) {
    assert.ok(tableLines.some(x => x.includes('TABLE DATA public ' + name + ' ')),
      'STOP: official data table absent: ' + name);
  }
  assert.ok(!/ZapingFile(?:Event|ReceiptLink)?/.test(output),
    'STOP: experimental R2 objects detected in archive');
  return tableLines.length;
}
function sha256Local(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function sha256Container(id, path) {
  const output = invoke('docker', ['exec', id, 'sha256sum', path]);
  assert.match(output, /^[0-9a-f]{64}\s/);
  return output.split(/\s+/)[0];
}
function fingerprints(id, db) {
  const names = readSql(id, db, officialInventoryQuery()).split(/\r?\n/).filter(Boolean);
  const output = readSql(id, db, allFingerprintsQuery(names));
  return { names, output };
}
function verifyCandidate(op, rehearsal) {
  assert.equal(readSql(op, CANDIDATE, 'SELECT current_database(), current_user;'),
    CANDIDATE + '|' + USER, 'STOP: candidate DB identity mismatch');
  const migrations = requireExactHistory(op, CANDIDATE, 54);
  const sourceMigrations = requireExactHistory(rehearsal, SOURCE, 54);
  assert.deepEqual(migrations, sourceMigrations, 'STOP: candidate migration names differ');
  const r2Count = readSql(op, CANDIDATE,
    "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public' " +
    "AND tablename IN ('ZapingFile','ZapingFileReceiptLink','ZapingFileEvent');");
  assert.equal(r2Count, '0', 'STOP: candidate contains R2 tables');

  const [core, rows] = [
    readSql(op, CANDIDATE, coreCountsQuery()),
    readSql(op, CANDIDATE, officialCountsQuery()),
  ];
  assert.equal(core, '2|5|4|14|7|5|5|3|5', 'STOP: candidate business counts incorrect');
  assert.equal(rows, '110', 'STOP: candidate official row count incorrect');

  const trial = fingerprints(rehearsal, SOURCE);
  const candidate = fingerprints(op, CANDIDATE);
  assert.deepEqual(candidate.names, trial.names, 'STOP: official table inventories differ');
  verifyTableFingerprints(trial.output, candidate.output);
}
function main() {
  if (process.argv.length !== 3 || process.argv[2] !== ARG) {
    throw new Error('HOLD: candidate creation requires explicit ' + ARG);
  }
  assert.equal(process.cwd().replace(/\\/g, '/').endsWith('/zaping'), true,
    'STOP: run from Zaping repository root');

  // The preflight compares ALL 57 table fingerprints before anything mutates.
  const preflight = invoke(process.execPath,
    ['scripts/qa/issue284-cutover-preflight.cjs']);
  assert.ok(preflight.includes('PASS: all 57 official table fingerprints'),
    'STOP: current QA/v3 preflight did not pass');
  assert.ok(preflight.includes('HOLD: NO database created'),
    'STOP: preflight did not preserve hold');

  const op = container(QA_PROJECT);
  const rehearsal = container(REHEARSAL_PROJECT);
  assert.notEqual(op, rehearsal, 'STOP: operational and rehearsal containers overlap');
  assertCandidateAbsent(op);
  assert.equal(readSql(op, ORIGINAL, 'SELECT current_database(),current_user;'),
    ORIGINAL + '|' + USER, 'STOP: operational QA identity mismatch');
  assert.equal(readSql(rehearsal, SOURCE, 'SELECT current_database(),current_user;'),
    SOURCE + '|' + USER, 'STOP: official v3 identity mismatch');

  const unique = randomUUID();
  const sourceDump = '/tmp/issue284-official-candidate-' + unique + '.dump';
  const targetDump = '/tmp/issue284-official-candidate-' + unique + '.dump';
  const work = mkdtempSync(join(tmpdir(), 'zaping-issue284-staging-'));
  const localDump = join(work, 'official-v3.dump');
  let candidateCreated = false;
  try {
    // A full custom archive carries 54 official migration records + schema + data.
    invoke('docker', [
      'exec', '--env', 'PGOPTIONS=-c default_transaction_read_only=on',
      rehearsal, 'pg_dump', '-Fc', '--no-owner', '--no-acl',
      '-U', USER, '-d', SOURCE, '-f', sourceDump,
    ]);
    const list = invoke('docker', ['exec', rehearsal, 'pg_restore', '--list', sourceDump]);
    validateArchiveList(list);
    invoke('docker', ['cp', rehearsal + ':' + sourceDump, localDump]);
    const sourceHash = sha256Local(localDump);
    assert.equal(sourceHash, sha256Container(rehearsal, sourceDump),
      'STOP: archive copy SHA-256 differs from source');

    invoke('docker', ['cp', localDump, op + ':' + targetDump]);
    assert.equal(sourceHash, sha256Container(op, targetDump),
      'STOP: archive copy SHA-256 differs in operational container');
    validateArchiveList(invoke('docker', [
      'exec', op, 'pg_restore', '--list', targetDump,
    ]));

    // Repeat the NO-EXIST guard immediately before the only createdb call.
    assertCandidateAbsent(op);
    invoke('docker', ['exec', op, 'createdb', '-U', USER,
      '-T', 'template0', CANDIDATE]);
    candidateCreated = true;
    console.log('PASS: separate QA candidate created; original zaping_qa remains untouched');

    // No --clean, --create, --disable-triggers or migration commands.
    // Target is a NEW db only, with all changes in one pg_restore transaction.
    invoke('docker', ['exec', op, 'pg_restore', '--exit-on-error',
      '--single-transaction', '--no-owner', '--no-acl', '-U', USER,
      '-d', CANDIDATE, targetDump]);
    verifyCandidate(op, rehearsal);

    // Re-read original QA data AFTER loading candidate to detect concurrent writes.
    const current = fingerprints(op, ORIGINAL);
    const source = fingerprints(rehearsal, SOURCE);
    assert.deepEqual(current.names, source.names, 'STOP: original QA tables changed');
    verifyTableFingerprints(current.output, source.output);
    const originalHistory = requireExactHistory(op, ORIGINAL, 55);
    assert.equal(originalHistory.filter(n => n === HISTORY_R2).length, 1,
      'STOP: operational QA historical R2 changed');

    console.log('PASS: candidate has 54 official migrations, 0 R2, 110 matching rows in 57 tables');
    console.log('PASS: original operational QA fingerprints remain unchanged after candidate import');
    console.log('HOLD: candidate is NOT live; API/Web, env files, QA original, production and R2 untouched');
  } catch (e) {
    if (candidateCreated) {
      console.error('HOLD: candidate DB exists but is NOT approved; preserve it for diagnosis, never rerun');
    }
    throw e;
  } finally {
    // Remove ONLY temporary sensitive host staging files, not any DB or volume.
    rmSync(work, { recursive: true, force: true });
    // No Docker down, DROP, DELETE, migration resolve or changes to .env.
  }
}
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message.slice(0, 230) : 'STOP: unknown');
    process.exitCode = 1;
  }
}
module.exports = {
  validateArchiveList, assertCandidateAbsent, ARG, CANDIDATE,
};
