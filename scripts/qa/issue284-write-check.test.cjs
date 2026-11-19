'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { trialUrl } = require('./issue284-write-check.cjs');
const { sourceCountsQuery } = require('./prepare-issue284-write-trial.cjs');

const env = (extra = {}) => ({
  NODE_ENV: 'test', POSTGRES_USER: 'zaping_qa',
  POSTGRES_DB: 'zaping_qa', POSTGRES_PASSWORD: 'test#/? password',
  ...extra,
});

test('write smoke pins database to new isolated trial, never v3 or operational QA', () => {
  const url = new URL(trialUrl(env()));
  assert.equal(url.hostname, 'zaping-qa-postgres');
  assert.equal(url.port, '5432');
  assert.equal(url.username, 'zaping_qa');
  assert.equal(url.pathname, '/zaping_issue284_write_trial_v1');
  assert.equal(url.password, 'test%23%2F%3F%20password');
});

test('write runner fails closed on credentials or unexpected identity', () => {
  for (const extra of [
    { NODE_ENV: 'production' },
    { POSTGRES_USER: 'postgres' },
    { POSTGRES_DB: 'zaping_dev' },
    { POSTGRES_PASSWORD: '' },
    { DATABASE_URL: 'postgresql://localhost:5433/zaping_qa' },
    { JWT_SECRET: 'real-qa-secret' },
    { RESEND_API_KEY: 'real' },
    { POSTALKIT_API_KEY: 'real' },
    { R2_ACCESS_KEY_ID: 'real' },
    { R2_SECRET_ACCESS_KEY: 'real' },
    { AWS_SECRET_ACCESS_KEY: 'real' },
  ]) {
    assert.throws(() => trialUrl(env(extra)), /STOP:/);
  }
});

test('clone preflight includes the preserved migration and official data baseline', () => {
  const sql = sourceCountsQuery();
  assert.match(sql, /_prisma_migrations/);
  assert.match(sql, /20261113190000_zaping_files_r2_v1/);
  for (const model of ['Company', 'User', 'Customer', 'Purchase', 'PurchaseItem']) {
    assert.ok(sql.includes('"' + model + '"'));
  }
});
