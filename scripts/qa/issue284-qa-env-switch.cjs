'use strict';

/**
 * Issue #284: protected file-only QA connection change.
 * Never starts/stops Docker, touches a database, or prints credentials.
 * --switch: requires QA API stopped; backs up complete .qa/api.env privately
 * --rollback: requires QA API stopped; restores exact original file
 * This helper does not authorize the cutover independently: see runbook.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ORIGINAL = 'zaping_qa';
const TARGET = 'zaping_qa_official_candidate_v1';
const ENV_PATH = path.resolve('.qa/api.env');
const STATE_PATH = path.resolve('.qa/issue284-api-switch-state.json');
const BACKUPS = path.join(os.homedir(), 'Documents', 'Zaping-QA-Backups');
const BRANCH = 'fix/issue-284-qa-migration-lineage-audit-20261118';
const hash = (data) => createHash('sha256').update(data).digest('hex');

function replaceDatabase(text, source, destination) {
  assert.equal(typeof text, 'string');
  const pattern = /^DATABASE_URL=([^\r\n]*)$/gm;
  let count = 0;
  const revised = text.replace(pattern, (_line, storedValue) => {
    count++;
    let value = storedValue;
    let quote = '';
    if (value.startsWith('"') || value.startsWith("'")) {
      quote = value[0];
      assert.ok(value.endsWith(quote), 'STOP: malformed DATABASE_URL quote');
      value = value.slice(1, -1);
    }
    let url;
    try { url = new URL(value); }
    catch { throw new Error('STOP: invalid QA DATABASE_URL'); }
    assert.ok(['postgresql:', 'postgres:'].includes(url.protocol),
      'STOP: invalid DB protocol');
    assert.equal(url.hostname, 'zaping-qa-postgres', 'STOP: unexpected database host');
    assert.equal(url.port, '5432', 'STOP: unexpected database port');
    assert.equal(url.username, 'zaping_qa', 'STOP: unexpected DB user');
    assert.ok(url.password, 'STOP: missing DB password');
    assert.equal(url.pathname, '/' + source, 'STOP: unexpected DB name');
    assert.ok(!url.searchParams.has('schema') ||
      url.searchParams.get('schema') === 'public', 'STOP: unexpected schema');
    url.pathname = '/' + destination;
    return 'DATABASE_URL=' + quote + url.toString() + quote;
  });
  assert.equal(count, 1, 'STOP: expected one DATABASE_URL entry');
  return revised;
}
function atomicWrite(file, value) {
  const temp = file + '.issue284-' + randomBytes(6).toString('hex');
  fs.writeFileSync(temp, value, { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.rmSync(temp); }
}
function ensureStopped() {
  const project = 'zaping-local-qa';
  const output = execFileSync('docker', [
    'ps', '-q',
    '--filter', 'label=com.docker.compose.project=' + project,
    '--filter', 'label=com.docker.compose.service=api',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert.equal(output, '', 'STOP: QA API must be stopped before changing config');
}
function validateHost() {
  assert.equal(process.platform, 'win32', 'STOP: Windows host required');
  const current = execFileSync('git', ['branch', '--show-current'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  assert.equal(current, BRANCH, 'STOP: unexpected branch');
  assert.ok(fs.existsSync(ENV_PATH), 'STOP: missing .qa/api.env');
  assert.ok(!fs.existsSync(path.resolve('.qa', '.git')),
    'STOP: unexpected QA folder repository');
}
function switchFile() {
  validateHost();
  ensureStopped();
  assert.ok(!fs.existsSync(STATE_PATH),
    'STOP: a prior cutover state exists; never overwrite');
  const original = fs.readFileSync(ENV_PATH, 'utf8');
  const candidate = replaceDatabase(original, ORIGINAL, TARGET);
  // Verify round-trip transformation before touching files.
  assert.equal(replaceDatabase(candidate, TARGET, ORIGINAL), original,
    'STOP: URL transformation not lossless');
  fs.mkdirSync(BACKUPS, { recursive: true });
  const backup = path.join(BACKUPS, 'issue284-api-env-' +
    new Date().toISOString().replace(/[:.]/g, '-') + '-' +
    randomBytes(4).toString('hex') + '.bak');
  fs.writeFileSync(backup, original, { flag: 'wx', mode: 0o600 });
  assert.equal(hash(fs.readFileSync(backup, 'utf8')), hash(original),
    'STOP: configuration backup mismatch');
  const state = {
    issue: 284, source: ORIGINAL, target: TARGET,
    backup, originalHash: hash(original), candidateHash: hash(candidate),
    status: 'candidate_configured_api_stopped',
    createdAt: new Date().toISOString(),
  };
  // State is metadata ONLY; no URL, JWT or password.
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  atomicWrite(ENV_PATH, candidate);
  assert.equal(hash(fs.readFileSync(ENV_PATH, 'utf8')), state.candidateHash,
    'STOP: candidate configuration write failed');
  console.log('PASS: QA env backed up and DATABASE_URL points to official candidate');
  console.log('HOLD: QA API is still stopped; original DB and all secrets preserved');
}
function rollbackFile() {
  validateHost();
  ensureStopped();
  assert.ok(fs.existsSync(STATE_PATH), 'STOP: no prior cutover state');
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  assert.equal(state.issue, 284);
  assert.equal(state.source, ORIGINAL);
  assert.equal(state.target, TARGET);
  assert.equal(path.dirname(state.backup), BACKUPS, 'STOP: invalid backup location');
  const original = fs.readFileSync(state.backup, 'utf8');
  const current = fs.readFileSync(ENV_PATH, 'utf8');
  assert.equal(hash(original), state.originalHash, 'STOP: backup hash changed');
  assert.ok([state.candidateHash, state.originalHash].includes(hash(current)),
    'STOP: .qa/api.env was edited independently');
  assert.equal(replaceDatabase(original, ORIGINAL, TARGET),
    current === original ? replaceDatabase(current, ORIGINAL, TARGET) : current,
    'STOP: candidate config does not match backed-up config');
  atomicWrite(ENV_PATH, original);
  assert.equal(hash(fs.readFileSync(ENV_PATH, 'utf8')), state.originalHash,
    'STOP: rollback file verification failed');
  state.status = 'original_config_restored_api_stopped';
  state.restoredAt = new Date().toISOString();
  atomicWrite(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
  console.log('PASS: original QA DATABASE_URL and complete .qa/api.env restored');
  console.log('HOLD: start QA API separately and verify connection/health; no database altered');
}
if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('STOP: specify --switch or --rollback');
    if (process.argv[2] === '--switch') switchFile();
    else if (process.argv[2] === '--rollback') rollbackFile();
    else throw new Error('STOP: unrecognized operation');
  } catch (e) {
    // Never show raw Docker output, URLs, tokens or environment contents.
    console.error(e instanceof Error && e.message.startsWith('STOP:')
      ? e.message : 'STOP: QA config switch failed; inspect safely');
    process.exitCode = 1;
  }
}
module.exports = { replaceDatabase, ORIGINAL, TARGET };
