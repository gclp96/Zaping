'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { prepareUrls, digestUsers } = require('./issue284-api-candidate-connection-check.cjs');

const config = (overrides = {}) => ({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://zaping_qa:s%23cret@zaping-qa-postgres:5432/zaping_qa?schema=public',
  ...overrides,
});

test('candidate connection derives ONLY the separate official DB from QA runtime URL', () => {
  const { source, candidate } = prepareUrls(config());
  assert.equal(new URL(source).pathname, '/zaping_qa');
  assert.equal(new URL(candidate).pathname, '/zaping_qa_official_candidate_v1');
  assert.equal(new URL(candidate).password, 's%23cret');
  assert.equal(new URL(candidate).host, 'zaping-qa-postgres:5432');
  assert.equal(new URL(candidate).searchParams.get('schema'), 'public');
});

test('runtime check rejects wrong source/host/runtime and missing credentials', () => {
  for (const override of [
    { NODE_ENV: 'production' },
    { NODE_ENV: 'test' },
    { DATABASE_URL: '' },
    { DATABASE_URL: 'postgresql://zaping_qa:secret@localhost:5433/zaping_qa' },
    { DATABASE_URL: 'postgresql://zaping_qa:secret@zaping-qa-postgres:5432/zaping_dev' },
    { DATABASE_URL: 'postgresql://zaping_qa:secret@zaping-qa-postgres:5432/zaping_qa_official_candidate_v1' },
    { DATABASE_URL: 'postgresql://postgres:secret@zaping-qa-postgres:5432/zaping_qa' },
    { DATABASE_URL: 'postgresql://zaping_qa@zaping-qa-postgres:5432/zaping_qa' },
    { DATABASE_URL: 'postgresql://zaping_qa:secret@zaping-qa-postgres:5432/zaping_qa?schema=other' },
  ]) {
    assert.throws(() => prepareUrls(config(override)), /STOP:/);
  }
});

test('credential fingerprint detects changes without printing secret hashes', () => {
  const users = Array.from({ length: 5 }, (_, i) => ({
    id: 'id' + i, companyId: 'company' + (i % 2),
    email: 'user' + i + '@invalid.test', passwordHash: 'hash' + i,
    role: 'ADMIN', authVersion: 0, isActive: true,
  }));
  assert.equal(digestUsers(users), digestUsers(users.slice().reverse()));
  assert.notEqual(digestUsers(users), digestUsers(users.map((u, i) =>
    i === 0 ? { ...u, authVersion: 1 } : u)));
  assert.throws(() => digestUsers(users.slice(1)), /STOP:/);
});

test('runtime candidate script performs SELECT-only checks, no env or service mutation', () => {
  const source = readFileSync(__dirname + '/issue284-api-candidate-connection-check.cjs', 'utf8');
  assert.match(source, /current_database\(\)/);
  assert.match(source, /passwordHash/);
  assert.match(source, /authVersion/);
  assert.doesNotMatch(source, /spawn\(|execFileSync\(|writeFile|--disable-triggers|migrate deploy|db push|down -v|DROP DATABASE/i);
  assert.doesNotMatch(source, /\$executeRaw|\$queryRawUnsafe\(\s*['"](?:UPDATE|DELETE|INSERT|CREATE|DROP)/);
});
