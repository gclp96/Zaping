'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const {
  officialCountsQuery, coreCountsQuery, assertSnapshot,
  CANDIDATE, OFFICIAL_TABLES,
} = require('./issue284-cutover-preflight.cjs');

test('cutover preflight only names the new QA candidate', () => {
  assert.equal(CANDIDATE, 'zaping_qa_official_candidate_v1');
  assert.notEqual(CANDIDATE, 'zaping_qa');
  assert.equal(OFFICIAL_TABLES.length, 22);
  assert.ok(!OFFICIAL_TABLES.some(name => name.startsWith('ZapingFile')));
});

test('preflight totals official data without migration or R2 tables', () => {
  const query = officialCountsQuery();
  assert.equal((query.match(/SELECT COUNT\(\*\)/g) || []).length, 22);
  assert.match(query, /public\."Company"/);
  assert.match(query, /public\."HealthcareCase"/);
  assert.doesNotMatch(query, /ZapingFile|_prisma_migrations/);
  const core = coreCountsQuery();
  assert.equal((core.match(/SELECT COUNT\(\*\)/g) || []).length, 9);
});

test('preflight fails closed on missing or changed data', () => {
  const good = { core: '2|5|4|14|7|5|5|3|5', rows: '110' };
  assert.doesNotThrow(() => assertSnapshot('v3', good));
  assert.throws(() => assertSnapshot('v3', { ...good, rows: '111' }), /STOP:/);
  assert.throws(() => assertSnapshot('v3', { ...good, core: '2|5|5|14|7|5|5|3|5' }), /STOP:/);
});

test('preflight is read-only and never invokes DB writes or Compose up', () => {
  const source = readFileSync(__dirname + '/issue284-cutover-preflight.cjs', 'utf8');
  assert.match(source, /PGOPTIONS=-c default_transaction_read_only=on/);
  assert.doesNotMatch(source, /\bcreatedb\b|\bdropdb\b|migrate deploy|docker compose up/);
  assert.doesNotMatch(source, /execFileSync\([^,]+,\s*\[[^\]]*'rm'/);
  assert.match(source, /NO database created/);
});
