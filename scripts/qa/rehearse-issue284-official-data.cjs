'use strict';

/**
 * Issue #284: isolated, atomic, data-only QA transfer trial.
 * NEVER reads or writes operational QA. All database calls use the separate
 * zaping-issue284-rehearsal Docker Compose project, with strict identity gates.
 *
 * Run from the repository root:
 *   node scripts/qa/rehearse-issue284-official-data.cjs
 */
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const COMPOSE = 'docker-compose.qa-history-rehearsal.yml';
const PROJECT = 'zaping-issue284-rehearsal';
const SERVICE = 'zaping-qa-postgres';
const USER = 'zaping_qa';
const CLEAN_DB = 'zaping_qa';
const SOURCE_DB = 'zaping_issue284_restore_check';
const TRIAL_DB = 'zaping_issue284_transfer_trial_v2';
const R2 = '20261113190000_zaping_files_r2_v1';
const EXPECTED_MIGRATIONS = 54;
const EXCLUDED = new Set([
  '_prisma_migrations', 'ZapingFile', 'ZapingFileEvent', 'ZapingFileReceiptLink',
]);

function command(bin, args, options = {}) {
  try {
    return execFileSync(bin, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    }).trim();
  } catch (error) {
    const details = Buffer.isBuffer(error.stderr)
      ? error.stderr.toString('utf8')
      : typeof error.stderr === 'string' ? error.stderr : '';
    throw new Error((details || error.message).trim().slice(0, 2000));
  }
}

function compose(args) {
  return command('docker', ['compose', '-f', COMPOSE, 'exec', '-T', SERVICE, ...args]);
}

function psql(database, sql) {
  return compose([
    'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
    '-U', USER, '-d', database, '-c', sql,
  ]);
}

function identifier(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error('STOP: invalid database identifier');
  }
  return '"' + name + '"';
}

function listFromSql(value) {
  return value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function officialTableNames(text) {
  const names = listFromSql(text);
  if (names.length < 22 || names.some((name) => EXCLUDED.has(name))) {
    throw new Error('STOP: official table inventory not recognized');
  }
  return names.map(identifier);
}

/**
 * pg_restore clears search_path even when the app's current schema is public.
 * Some official deferred trigger functions still query unqualified tables.
 * Only in the isolated trial: set a trusted path for the restore SESSION.
 * Never change a function, constraint, DB or migration to bypass this.
 */
function restoreWithQualifiedSearchPath(plainSql) {
  const reset = "SELECT pg_catalog.set_config('search_path', '', false);";
  const exactResetLines = plainSql.match(/^SELECT pg_catalog\.set_config\('search_path', '', false\);$/gm) || [];
  const allSearchPathMentions = plainSql.match(/search_path/gi) || [];
  if (exactResetLines.length !== 1 || allSearchPathMentions.length !== 1) {
    throw new Error('STOP: unexpected pg_restore search_path header; no import attempted');
  }
  return plainSql.replace(reset, reset + '\nSET search_path = pg_catalog, public;');
}

function countAndFingerprintSql(quotedName) {
  return (
    'SELECT COUNT(*), ' +
    "COALESCE(md5(string_agg(md5(to_jsonb(t)::text), '' " +
    "ORDER BY md5(to_jsonb(t)::text))), md5('')) " +
    'FROM public.' + quotedName + ' t;'
  );
}

function preflight() {
  const id = command('docker', ['compose', '-f', COMPOSE, 'ps', '-q', SERVICE]);
  if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('STOP: rehearsal container missing');
  const name = command('docker', ['inspect', '--format', '{{.Name}}', id]);
  const running = command('docker', ['inspect', '--format', '{{.State.Running}}', id]);
  if (!name.startsWith('/' + PROJECT + '-' + SERVICE + '-') || running !== 'true') {
    throw new Error('STOP: unexpected Docker project; operational QA is forbidden');
  }
  if (psql('postgres', 'SELECT current_user;') !== USER) {
    throw new Error('STOP: wrong database user');
  }
  const baselineSql = [
    'SELECT',
    '(SELECT COUNT(*) FROM public._prisma_migrations',
    ' WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),',
    "(SELECT COUNT(*) FROM public._prisma_migrations WHERE migration_name = '" + R2 + "'),",
    '(SELECT COUNT(*) FROM public."Company");',
  ].join(' ');
  if (psql(CLEAN_DB, baselineSql) !== EXPECTED_MIGRATIONS + '|0|0') {
    throw new Error('STOP: clean baseline differs (expected 54 official migrations, no R2, 0 companies)');
  }
  if (psql('postgres',
    "SELECT COUNT(*) FROM pg_database WHERE datname = '" + TRIAL_DB + "';") !== '0') {
    throw new Error('STOP: target database already exists; will not overwrite');
  }
}

function officialObjects() {
  const tables = officialTableNames(psql(
    CLEAN_DB,
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' " +
    "AND tablename <> '_prisma_migrations' ORDER BY tablename;",
  ));
  const sequences = listFromSql(psql(
    CLEAN_DB,
    "SELECT c.relname FROM pg_catalog.pg_class c " +
    "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace " +
    "WHERE n.nspname = 'public' AND c.relkind = 'S' ORDER BY c.relname;",
  )).map(identifier);
  return { tables, sequences };
}

function compareRows(tables) {
  let total = 0;
  const mismatch = [];
  for (const table of tables) {
    const sql = countAndFingerprintSql(table);
    const source = psql(SOURCE_DB, sql);
    const trial = psql(TRIAL_DB, sql);
    if (!/^\d+\|[a-f0-9]{32}$/.test(source) ||
        !/^\d+\|[a-f0-9]{32}$/.test(trial)) {
      throw new Error('STOP: unexpected SQL fingerprint output');
    }
    total += Number(source.split('|')[0]);
    if (source !== trial) mismatch.push(table);
  }
  return { total, mismatch };
}

function main() {
  preflight();
  const { tables, sequences } = officialObjects();
  const archive = '/tmp/issue284-official-data-' + randomUUID() + '.dump';
  console.log('Target Docker project verified. No operational QA connection is made.');
  console.log('Copying data-only from', tables.length, 'official tables and',
    sequences.length, 'sequences in the isolated restored DB');

  compose([
    'pg_dump', '--format=custom', '--data-only',
    '-U', USER, '-d', SOURCE_DB, '-f', archive,
    ...[...tables, ...sequences].map((x) => '--table=public.' + x),
  ]);

  const archiveList = compose(['pg_restore', '--list', archive]);
  if (
    /\b(?:TABLE DATA|SEQUENCE SET)\s+public\s+(?:ZapingFile(?:Event|ReceiptLink)?|_prisma_migrations)\s/.test(archiveList) ||
    !/\bTABLE DATA\s+public\s+Company\s/.test(archiveList)
  ) {
    throw new Error('STOP: archive contains forbidden tables or lacks Company');
  }

  // This only creates an additional DB within the isolated rehearsal project.
  compose(['createdb', '-U', USER, '-T', CLEAN_DB, TRIAL_DB]);
  console.log('Official schema cloned into new trial database');

  // Convert archive to PostgreSQL SQL and replace only its search_path header.
  // PostgreSQL pg_restore resets search_path to empty, which breaks unqualified
  // table references in the existing deferrable custody trigger functions.
  // Keep all triggers/FKs enabled and the entire data import atomic.
  const restoreSql = compose([
    'pg_restore', '--data-only', '--no-owner', '--no-acl', archive,
  ]);
  const safeRestoreSql = restoreWithQualifiedSearchPath(restoreSql);
  command('docker', [
    'compose', '-f', COMPOSE, 'exec', '-T', SERVICE,
    'psql', '-X', '--single-transaction', '-v', 'ON_ERROR_STOP=1',
    '-U', USER, '-d', TRIAL_DB, '-f', '-',
  ], { input: safeRestoreSql + '\n' });
  console.log('Data-only import completed; verifying source/trial fingerprints');

  const migrations = psql(TRIAL_DB,
    'SELECT COUNT(*) FROM public._prisma_migrations ' +
    'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;');
  const r2Record = psql(TRIAL_DB,
    "SELECT COUNT(*) FROM public._prisma_migrations WHERE migration_name = '" + R2 + "';");
  const r2Tables = psql(TRIAL_DB,
    "SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public' " +
    "AND tablename IN ('ZapingFile', 'ZapingFileEvent', 'ZapingFileReceiptLink');");
  if (migrations !== String(EXPECTED_MIGRATIONS) ||
      r2Record !== '0' || r2Tables !== '0') {
    throw new Error('STOP: unexpected trial migration state');
  }

  const { total, mismatch } = compareRows(tables);
  console.log('Official rows in restored source:', total, '(expected 110)');
  console.log('Tables with count/data mismatches:', mismatch);
  if (total !== 110 || mismatch.length > 0) {
    throw new Error('STOP: data integrity comparison failed');
  }
  console.log('PASS: official-only trial, 54 migrations, 110 matching rows, no R2');
  console.log('HOLD: production/operational QA switch is NOT authorized');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('STOPPED SAFELY:', error instanceof Error ? error.message.split('\n')[0] : 'unknown error');
    process.exitCode = 1;
  }
}

module.exports = { identifier, listFromSql, officialTableNames, countAndFingerprintSql, restoreWithQualifiedSearchPath };
