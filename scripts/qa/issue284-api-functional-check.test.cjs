'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { databaseUrl, signJwt } = require('./issue284-api-functional-check.cjs');

function minimalEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    POSTGRES_USER: 'zaping_qa',
    POSTGRES_DB: 'zaping_qa',
    POSTGRES_PASSWORD: 'secret with !/?#',
    ...overrides,
  };
}

test('functional target is the restored official trial, never operational QA', () => {
  const result = new URL(databaseUrl(minimalEnv()));
  assert.equal(result.hostname, 'zaping-qa-postgres');
  assert.equal(result.port, '5432');
  assert.equal(result.pathname, '/zaping_issue284_transfer_trial_v3');
  assert.equal(result.username, 'zaping_qa');
  assert.equal(result.password, 'secret%20with%20!%2F%3F%23');
});

test('functional test rejects different QA identities and operational secrets', () => {
  const forbidden = [
    { DATABASE_URL: 'postgresql://localhost:5433/zaping_qa' },
    { JWT_SECRET: 'real-qa-token-secret' },
    { RESEND_API_KEY: 'not-for-trial' },
    { POSTALKIT_API_KEY: 'not-for-trial' },
    { R2_ACCESS_KEY_ID: 'not-for-trial' },
    { POSTGRES_USER: 'postgres' },
    { POSTGRES_DB: 'zaping_dev' },
    { NODE_ENV: 'production' },
    { POSTGRES_PASSWORD: '' },
  ];
  for (const override of forbidden) {
    assert.throws(() => databaseUrl(minimalEnv(override)), /STOP:/);
  }
});

test('synthetic tokens are short-lived and use HS256, not QA JWT secrets', () => {
  const user = {
    id: 'synthetic-user', companyId: 'synthetic-company',
    role: 'ADMIN', email: 'synthetic@example.invalid', authVersion: 2,
  };
  const token = signJwt(user, 'isolated-only-secret', 1000);
  const [header, body, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), {
    alg: 'HS256', typ: 'JWT',
  });
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  assert.equal(payload.companyId, 'synthetic-company');
  assert.equal(payload.authVersion, 2);
  assert.equal(payload.exp - payload.iat, 900);
  assert.equal(
    signature,
    createHmac('sha256', 'isolated-only-secret').update(header + '.' + body).digest('base64url'),
  );
});
