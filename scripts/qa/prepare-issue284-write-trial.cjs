'use strict';

/**
 * Issue 284: make an append-only, disposable DB copy for a minimal WRITE smoke.
 * Run from repo root. Never connects to operational QA or replaces any DB.
 */
const { execFileSync } = require('node:child_process');

const COMPOSE = 'docker-compose.qa-history-rehearsal.yml';
const PROJECT = 'zaping-issue284-rehearsal';
const SERVICE = 'zaping-qa-postgres';
const USER = 'zaping_qa';
const SOURCE = 'zaping_issue284_transfer_trial_v3';
const TARGET = 'zaping_issue284_write_trial_v1';

function command(binary, args) {
  try {
    return execFileSync(binary, args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
    }).trim();
  } catch (e) {
    // Never include command arguments or connection strings in error output.
    throw new Error('STOP: rehearsal command failed: ' + (e.status ?? 'unknown'));
  }
}
function inside(args) {
  return command('docker', ['compose', '-f', COMPOSE, 'exec', '-T', SERVICE, ...args]);
}
function sql(db, statement) {
  return inside(['psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', USER, '-d', db, '-c', statement]);
}
function sourceCountsQuery() {
  return [
    'SELECT',
    '(SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),',
    "(SELECT count(*) FROM public._prisma_migrations WHERE migration_name = '20261113190000_zaping_files_r2_v1'),",
    '(SELECT count(*) FROM public."Company"),',
    '(SELECT count(*) FROM public."User"),',
    '(SELECT count(*) FROM public."Customer"),',
    '(SELECT count(*) FROM public."Purchase"),',
    '(SELECT count(*) FROM public."PurchaseItem");',
  ].join(' ');
}
function preflight() {
  const id = command('docker', ['compose', '-f', COMPOSE, 'ps', '-q', SERVICE]);
  if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('STOP: rehearsal container missing');
  const project = command('docker', ['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', id]);
  const name = command('docker', ['inspect', '--format', '{{.Name}}', id]);
  const running = command('docker', ['inspect', '--format', '{{.State.Running}}', id]);
  if (project !== PROJECT || !name.startsWith('/' + PROJECT + '-' + SERVICE + '-') || running !== 'true') {
    throw new Error('STOP: unexpected Docker identity');
  }
  if (sql('postgres', 'SELECT current_user;') !== USER) throw new Error('STOP: unexpected DB user');
  if (sql(SOURCE, sourceCountsQuery()) !== '54|0|2|5|4|7|7') {
    throw new Error('STOP: v3 immutable source baseline unexpected');
  }
  if (sql(SOURCE, "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename IN ('ZapingFile','ZapingFileReceiptLink','ZapingFileEvent');") !== '0') {
    throw new Error('STOP: R2 objects present');
  }
  if (sql('postgres', "SELECT count(*) FROM pg_database WHERE datname = '" + TARGET + "';") !== '0') {
    throw new Error('STOP: write trial already exists; never overwrite or rerun');
  }
}
function main() {
  preflight();
  console.log('PASS: isolated Docker identity and read-only v3 preflight');
  inside(['createdb', '-U', USER, '-T', SOURCE, TARGET]);
  if (sql(TARGET, sourceCountsQuery()) !== '54|0|2|5|4|7|7') {
    throw new Error('STOP: cloned write trial baseline mismatch');
  }
  console.log('PASS: isolated write trial created with original 54 migrations and data');
  console.log('HOLD: only run the write-check on ' + TARGET + '; never alter v3 or operational QA');
}
if (require.main === module) {
  try { main(); } catch (e) {
    console.error(e instanceof Error ? e.message : 'STOP: unknown error');
    process.exitCode = 1;
  }
}
module.exports = { sourceCountsQuery };
