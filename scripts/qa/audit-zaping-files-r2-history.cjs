'use strict';

/**
 * Read-only QA migration lineage audit, issue #284.
 *
 * It NEVER executes migrations, changes a database or emits credentials.
 * Run from the repository root with Node 24:
 *   node scripts/qa/audit-zaping-files-r2-history.cjs
 */
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = '20261113190000_zaping_files_r2_v1';
const HISTORICAL_REF = 'b6ddc38';
const HISTORICAL_PATH =
  'app/api/prisma/migrations/' + MIGRATION + '/migration.sql';
const EXPECTED_CHECKSUM =
  '8fcee7b0a88f1ef1ce9d2655576fa5bfeacec00fbcb0e0dc0f42ec41790f3223';
const EXPECTED_API_DB = 'zaping-qa-postgres:5432/zaping_qa';

function run(command, args, binary = false) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: binary ? null : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 4,
  });
}

function digest(input) {
  return createHash('sha256').update(input).digest('hex');
}

function crlfBytes(buffer) {
  return Buffer.from(buffer.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
}

function compareHistories(localNames, appliedNames) {
  const local = new Set(localNames);
  const applied = new Set(appliedNames);
  return {
    databaseOnly: [...applied].filter((name) => !local.has(name)).sort(),
    repositoryOnly: [...local].filter((name) => !applied.has(name)).sort(),
  };
}

function psql(sql) {
  const stdout = run('docker', [
    'compose',
    '-f',
    'docker-compose.qa.yml',
    'exec',
    '-T',
    'zaping-qa-postgres',
    'psql',
    '-X',
    '-A',
    '-t',
    '-F',
    '|',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'zaping_qa',
    '-d',
    'zaping_qa',
    '-c',
    sql,
  ]);
  return stdout.trim();
}

function audit() {
  const branch = run('git', ['branch', '--show-current']).trim();
  const host = run('docker', [
    'compose',
    '-f',
    'docker-compose.qa.yml',
    'exec',
    '-T',
    'api',
    'node',
    '-p',
    "new URL(process.env.DATABASE_URL).host + new URL(process.env.DATABASE_URL).pathname",
  ]).trim();

  if (host !== EXPECTED_API_DB) {
    throw new Error('ABORT: API QA does not point to expected internal QA database.');
  }
  const identity = psql('SELECT current_database(), current_user;');
  if (identity !== 'zaping_qa|zaping_qa') {
    throw new Error('ABORT: unexpected PostgreSQL database identity.');
  }

  const original = run('git', ['show', HISTORICAL_REF + ':' + HISTORICAL_PATH], true);
  const hashes = {
    gitBlob: digest(original),
    gitBlobWithCRLF: digest(crlfBytes(original)),
  };
  const trackedSchema = readFileSync(
    path.join(ROOT, 'app/api/prisma/schema.prisma'),
    'utf8',
  );
  const r2ModelsPresent = [
    'ZapingFile',
    'ZapingFileReceiptLink',
    'ZapingFileEvent',
  ].some((model) => new RegExp('\\bmodel\\s+' + model + '\\s*\\{').test(trackedSchema));
  const sourceFileExists = existsSync(path.join(ROOT, HISTORICAL_PATH));

  const migrationsDirectory = path.join(ROOT, 'app/api/prisma/migrations');
  const localNames = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const appliedNames = psql(
    'SELECT migration_name FROM _prisma_migrations ' +
      'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;',
  ).split(/\r?\n/).filter(Boolean);
  const histories = compareHistories(localNames, appliedNames);

  const historical = psql(
    "SELECT checksum, finished_at IS NOT NULL, rolled_back_at IS NULL " +
      "FROM _prisma_migrations WHERE migration_name = '" + MIGRATION + "';",
  );
  if (!historical) {
    throw new Error('ABORT: historical R2 migration not recorded in expected QA database.');
  }
  const rows = historical.split(/\r?\n/).filter(Boolean);
  if (rows.length !== 1) {
    throw new Error('ABORT: unexpected number of R2 migration records.');
  }
  const [storedChecksum, finished, notRolledBack] = rows[0].split('|');
  const sourceMatches =
    storedChecksum === hashes.gitBlob || storedChecksum === hashes.gitBlobWithCRLF;
  const expectedMatches = storedChecksum === EXPECTED_CHECKSUM;

  const objectNames = ['ZapingFile', 'ZapingFileReceiptLink', 'ZapingFileEvent'];
  const objectPresence = psql(
    "SELECT " +
      objectNames
        .map((name) => "to_regclass('public.\"" + name + "\"') IS NOT NULL")
        .join(', ') +
      ';',
  ).split('|');
  const objects = objectNames.map((name, i) => ({
    name,
    present: objectPresence[i] === 't',
  }));
  const counts = objects.map((object) => ({
    name: object.name,
    count: object.present
      ? Number(psql('SELECT COUNT(*) FROM "' + object.name + '";'))
      : null,
  }));

  console.log('Issue #284 — READ-ONLY QA migration audit');
  console.log('Branch:', branch);
  console.log('Database: zaping_qa / internal QA service (verified)');
  console.log('Historical migration:', MIGRATION);
  console.log('Recorded migration finished:', finished === 't');
  console.log('Recorded migration not rolled back:', notRolledBack === 't');
  console.log('Recorded checksum matches original Git content:', sourceMatches);
  console.log('Recorded checksum matches previously verified QA checksum:', expectedMatches);
  console.log('Matched byte variant:',
    hashes.gitBlob === storedChecksum
      ? 'Git blob'
      : hashes.gitBlobWithCRLF === storedChecksum
        ? 'Git blob with CRLF'
        : 'NONE');
  console.log('Migration file present in checkout:', sourceFileExists);
  console.log('ZapingFile Prisma models present:', r2ModelsPresent);
  console.log('Applied migrations absent from checkout:', histories.databaseOnly);
  console.log('Checkout migrations not applied:', histories.repositoryOnly);
  console.log('Historical R2 table row counts:', counts);

  if (
    !sourceMatches ||
    !expectedMatches ||
    finished !== 't' ||
    notRolledBack !== 't'
  ) {
    throw new Error('STOP: unknown migration identity. Do not deploy or repair history.');
  }
  if (r2ModelsPresent || sourceFileExists) {
    console.log('ATTENTION: repository now includes R2 structures; review the official integration.');
  } else {
    console.log(
      'RESULT: QA contains migration from unmerged PR #272. ' +
        'Keep existing QA untouched; rehearse current main migrations in a separately isolated database.',
    );
  }
  if (counts.some((entry) => entry.count > 0)) {
    console.log('HOLD: historical R2 tables contain records. Preserve original QA for investigation.');
  }
  // A recognized historical mismatch is not represented as a successful
  // reconciliation. This command is diagnostic only, never a repair.
}

if (require.main === module) {
  try {
    audit();
  } catch (error) {
    console.error(
      'Audit stopped safely:',
      error instanceof Error ? error.message.split('\n')[0] : 'unexpected error',
    );
    process.exitCode = 1;
  }
}

module.exports = { digest, crlfBytes, compareHistories };
