'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  replaceDatabase, ORIGINAL, TARGET,
} = require('./issue284-qa-env-switch.cjs');
const sync = require('./issue284-qa-candidate-sync-check.cjs');

const url = 'postgresql://zaping_qa:synthetic%23pass@zaping-qa-postgres:5432/zaping_qa?schema=public';

test('QA switch changes only candidate DB while retaining every other env line byte-for-byte', () => {
  const original = 'JWT_SECRET=synthetic_only_unchanged\r\nDATABASE_URL=' +
    url + '\r\nR2_ACCESS_KEY_ID=synthetic_only_unchanged\r\n';
  const candidate = replaceDatabase(original, ORIGINAL, TARGET);
  assert.equal(candidate.replace('/' + TARGET, '/' + ORIGINAL), original);
  assert.equal(replaceDatabase(candidate, TARGET, ORIGINAL), original);
  assert.ok(candidate.includes('JWT_SECRET=synthetic_only_unchanged'));
  assert.ok(candidate.includes('R2_ACCESS_KEY_ID=synthetic_only_unchanged'));
});

test('QA switch preserves a quoted DATABASE_URL', () => {
  const original = 'DATABASE_URL="' + url + '"\nCUSTOM_SETTING=untouched\n';
  assert.equal(replaceDatabase(replaceDatabase(original, ORIGINAL, TARGET),
    TARGET, ORIGINAL), original);
});

test('QA switch fails closed for duplicate, malformed or unexpected connections', () => {
  for (const env of [
    'NODE_ENV=development\n',
    'DATABASE_URL=' + url + '\nDATABASE_URL=' + url + '\n',
    'DATABASE_URL=bad\n',
    'DATABASE_URL=postgresql://zaping_qa:pw@evil.example:5432/zaping_qa\n',
    'DATABASE_URL=postgresql://zaping_qa:pw@zaping-qa-postgres:5432/zaping_dev\n',
    'DATABASE_URL=postgresql://zaping_qa@zaping-qa-postgres:5432/zaping_qa\n',
    'DATABASE_URL=postgresql://zaping_qa:pw@zaping-qa-postgres:5432/zaping_qa?schema=other\n',
  ]) assert.throws(() => replaceDatabase(env, ORIGINAL, TARGET));
});

test('switch code never writes DB, executes migration or restarts Docker', () => {
  const source = fs.readFileSync(path.join(__dirname, 'issue284-qa-env-switch.cjs'), 'utf8');
  assert.doesNotMatch(source, /pg_restore|pg_dump|createdb|dropdb|migrate reset|docker compose up/);
  assert.match(source, /ensureStopped\(\)/);
  assert.match(source, /Zaping-QA-Backups/);
  assert.match(source, /originalHash/);
  assert.match(source, /candidateHash/);
});

test('candidate sync-check references ONLY operational PostgreSQL and read-only sessions', () => {
  const source = fs.readFileSync(path.join(__dirname, 'issue284-qa-candidate-sync-check.cjs'), 'utf8');
  assert.equal(sync.ORIGINAL, 'zaping_qa');
  assert.equal(sync.CANDIDATE, 'zaping_qa_official_candidate_v1');
  assert.match(source, /PGOPTIONS=-c default_transaction_read_only=on/);
  assert.match(source, /verifyTableFingerprints/);
  assert.doesNotMatch(source, /\bdropdb\b|\bcreatedb\b|pg_restore|migrate deploy|migrate reset/);
});
