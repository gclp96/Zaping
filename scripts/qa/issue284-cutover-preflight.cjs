'use strict';

/**
 * Issue 284 — READ-ONLY cutover preflight. DO NOT create databases or switch
 * the API here. Every DB query runs with a read-only PGOPTIONS session.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const SERVICE = 'zaping-qa-postgres';
const USER = 'zaping_qa';
const OP = Object.freeze({
  project: 'zaping-local-qa',
  database: 'zaping_qa',
});
const TRIAL = Object.freeze({
  project: 'zaping-issue284-rehearsal',
  database: 'zaping_issue284_transfer_trial_v3',
});
const CANDIDATE = 'zaping_qa_official_candidate_v1';
const HISTORICAL_R2 = '20261113190000_zaping_files_r2_v1';
const R2_TABLES = Object.freeze([
  'ZapingFile', 'ZapingFileReceiptLink', 'ZapingFileEvent',
]);
const OFFICIAL_TABLES = Object.freeze([
  'Category', 'Company', 'CompanySequence', 'Customer', 'EquipmentAsset',
  'HealthcareCase', 'HealthcareCaseKit', 'HealthcareCaseKitItem',
  'HealthcareCaseRequirement', 'IdempotencyRecord', 'InventoryMovement',
  'Product', 'Purchase', 'PurchaseItem', 'PurchaseReceipt',
  'PurchaseReceiptItem', 'Quote', 'QuoteItem', 'Sale', 'SaleItem',
  'Supplier', 'User',
]);

function run(bin, args) {
  try {
    return execFileSync(bin, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    }).trim();
  } catch (e) {
    // Never expose connection strings or environment variables in output.
    throw new Error('STOP: Docker read-only preflight command failed (' + (e.status ?? 'unknown') + ')');
  }
}
function containerFor(project) {
  const ids = run('docker', [
    'ps', '-q',
    '--filter', 'label=com.docker.compose.project=' + project,
    '--filter', 'label=com.docker.compose.service=' + SERVICE,
  ]).split(/\r?\n/).filter(Boolean);
  assert.equal(ids.length, 1, 'STOP: expected one active PostgreSQL for ' + project);
  const id = ids[0];
  assert.match(id, /^[a-f0-9]{12,64}$/, 'STOP: unexpected Docker ID');
  const actualProject = run('docker', [
    'inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', id,
  ]);
  const actualService = run('docker', [
    'inspect', '--format', '{{index .Config.Labels "com.docker.compose.service"}}', id,
  ]);
  const name = run('docker', ['inspect', '--format', '{{.Name}}', id]);
  assert.equal(actualProject, project, 'STOP: Docker project label mismatch');
  assert.equal(actualService, SERVICE, 'STOP: Docker service label mismatch');
  assert.ok(
    name.startsWith('/' + project + '-' + SERVICE + '-'),
    'STOP: unexpected container name',
  );
  return id;
}
function sql(id, database, query) {
  return run('docker', [
    'exec',
    '--env', 'PGOPTIONS=-c default_transaction_read_only=on',
    id, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1',
    '-U', USER, '-d', database, '-c', query,
  ]);
}
function qName(name) {
  assert.match(name, /^[A-Za-z][A-Za-z0-9_]*$/);
  return '"' + name + '"';
}
function officialCountsQuery() {
  return 'SELECT ' + OFFICIAL_TABLES.map(
    (name) => '(SELECT COUNT(*) FROM public.' + qName(name) + ')',
  ).join(' + ') + ';';
}
function coreCountsQuery() {
  const names = [
    'Company', 'User', 'Customer', 'Product', 'Purchase',
    'PurchaseReceipt', 'Quote', 'Sale', 'HealthcareCase',
  ];
  return 'SELECT ' + names.map(
    (name) => '(SELECT COUNT(*) FROM public.' + qName(name) + ')',
  ).join(', ') + ';';
}
function officialInventoryQuery() {
  return "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' " +
    "AND tablename NOT IN ('_prisma_migrations','ZapingFile','ZapingFileReceiptLink','ZapingFileEvent') ORDER BY tablename;";
}
function fingerprintSql(name) {
  // Table names come only from pg_catalog and must use safe quoted identifiers.
  const table = qName(name);
  return "SELECT '" + name + "', COUNT(*), " +
    "COALESCE(md5(string_agg(md5(to_jsonb(t)::text), '' " +
    "ORDER BY md5(to_jsonb(t)::text))), md5('')) " +
    'FROM public.' + table + ' t';
}
function allFingerprintsQuery(names) {
  assert.equal(names.length, 57, 'STOP: unexpected official table inventory');
  return 'SELECT * FROM (' + names.map(fingerprintSql).join(' UNION ALL ') + ') AS fp ORDER BY 1;';
}
function verifyTableFingerprints(sourceOutput, targetOutput) {
  const lines = sourceOutput.split(/\r?\n/).filter(Boolean);
  const right = targetOutput.split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 57, 'STOP: original QA table fingerprints incomplete');
  assert.deepEqual(lines, right, 'STOP: data changed since v3 snapshot; freeze and re-plan');
  const total = lines.reduce((sum, line) => {
    assert.match(line, /^[A-Za-z_][A-Za-z0-9_]*\|\d+\|[a-f0-9]{32}$/);
    return sum + Number(line.split('|')[1]);
  }, 0);
  assert.equal(total, 110, 'STOP: total official data changed');
}
function assertSnapshot(label, actual) {
  assert.equal(actual.core, '2|5|4|14|7|5|5|3|5', 'STOP: ' + label + ' QA data changed');
  assert.equal(actual.rows, '110', 'STOP: ' + label + ' official row total changed');
}
function main() {
  const operational = containerFor(OP.project);
  const rehearsal = containerFor(TRIAL.project);
  assert.notEqual(operational, rehearsal, 'STOP: operational and rehearsal are the same container');

  const originalIdentity = sql(operational, OP.database, 'SELECT current_database(),current_user;');
  assert.equal(originalIdentity, 'zaping_qa|zaping_qa', 'STOP: unexpected QA DB identity');
  const v3Identity = sql(rehearsal, TRIAL.database, 'SELECT current_database(),current_user;');
  assert.equal(v3Identity, TRIAL.database + '|zaping_qa', 'STOP: unexpected v3 identity');

  const getNames = (id, db) => sql(id, db,
    'SELECT migration_name FROM public._prisma_migrations ' +
    'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;'
  ).split(/\r?\n/).filter(Boolean);

  const originalNames = getNames(operational, OP.database);
  const officialNames = getNames(rehearsal, TRIAL.database);
  assert.equal(originalNames.length, 55, 'STOP: QA migration count changed');
  assert.equal(officialNames.length, 54, 'STOP: v3 migration count changed');
  assert.equal(originalNames.filter(n => n === HISTORICAL_R2).length, 1,
    'STOP: R2 history in original QA changed');
  assert.ok(!officialNames.includes(HISTORICAL_R2), 'STOP: R2 history in v3');
  assert.deepEqual(
    originalNames.filter(n => n !== HISTORICAL_R2), officialNames,
    'STOP: migration names differ beyond R2',
  );

  const r2Sql = 'SELECT count(*) FROM pg_catalog.pg_tables ' +
    "WHERE schemaname = 'public' AND tablename IN (" +
    R2_TABLES.map((x) => "'" + x + "'").join(',') + ');';
  assert.equal(sql(operational, OP.database, r2Sql), '3',
    'STOP: QA historical R2 table state changed');
  assert.equal(sql(rehearsal, TRIAL.database, r2Sql), '0',
    'STOP: R2 tables present in official v3');

  const originalSnapshot = {
    core: sql(operational, OP.database, coreCountsQuery()),
    rows: sql(operational, OP.database, officialCountsQuery()),
  };
  const trialSnapshot = {
    core: sql(rehearsal, TRIAL.database, coreCountsQuery()),
    rows: sql(rehearsal, TRIAL.database, officialCountsQuery()),
  };
  assertSnapshot('operational', originalSnapshot);
  assertSnapshot('v3', trialSnapshot);

  const r2Counts = sql(operational, OP.database, [
    'SELECT (SELECT COUNT(*) FROM public."ZapingFile"),',
    '(SELECT COUNT(*) FROM public."ZapingFileReceiptLink"),',
    '(SELECT COUNT(*) FROM public."ZapingFileEvent");',
  ].join(' '));
  assert.equal(r2Counts, '1|1|3', 'STOP: historical R2 records changed; preserve before cutover');

  const qaNames = sql(operational, OP.database, officialInventoryQuery()).split(/\r?\n/).filter(Boolean);
  const v3Names = sql(rehearsal, TRIAL.database, officialInventoryQuery()).split(/\r?\n/).filter(Boolean);
  assert.deepEqual(qaNames, v3Names, 'STOP: source and v3 official tables differ');
  const fingerprintQuery = allFingerprintsQuery(qaNames);
  verifyTableFingerprints(
    sql(operational, OP.database, fingerprintQuery),
    sql(rehearsal, TRIAL.database, fingerprintQuery),
  );

  const candidateCount = sql(operational, 'postgres',
    "SELECT count(*) FROM pg_database WHERE datname = '" + CANDIDATE + "';");
  assert.equal(candidateCount, '0', 'STOP: QA candidate name exists; do not overwrite');

  console.log('PASS: operational QA identity; 55 migrations including historical R2; 110 official rows');
  console.log('PASS: isolated official v3 identity; 54 migrations, 0 R2, 110 official rows');
  console.log('PASS: all 57 official table fingerprints and 110 rows match current QA; candidate name available');
  console.log('HOLD: NO database created, NO data transferred, NO QA API/Web configuration changed');
}
if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message.replace(/\s+/g, ' ').slice(0, 260) : 'STOP: unknown');
    process.exitCode = 1;
  }
}
module.exports = {
  officialCountsQuery, coreCountsQuery, assertSnapshot, officialInventoryQuery,
  fingerprintSql, allFingerprintsQuery, verifyTableFingerprints,
  CANDIDATE, OFFICIAL_TABLES,
};
