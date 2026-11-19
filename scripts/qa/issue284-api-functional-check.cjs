'use strict';

/**
 * Issue #284 — isolated read-only API smoke check.
 * Only run from functional-check in zaping-issue284-rehearsal.
 * No host ports, external API keys, operational QA URL, writes or migrations.
 */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHmac, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');

const TARGET = 'zaping_issue284_transfer_trial_v3';
const HISTORICAL_R2 = '20261113190000_zaping_files_r2_v1';
const URL_BASE = 'http://127.0.0.1:3001';

function databaseUrl(env) {
  const forbidden = [
    'DATABASE_URL', 'JWT_SECRET', 'RESEND_API_KEY', 'POSTALKIT_API_KEY',
    'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ];
  if (
    env.NODE_ENV !== 'test' ||
    env.POSTGRES_USER !== 'zaping_qa' ||
    env.POSTGRES_DB !== 'zaping_qa' ||
    !env.POSTGRES_PASSWORD ||
    forbidden.some((key) => Boolean(env[key]))
  ) {
    throw new Error('STOP: missing QA rehearsal identity or unexpected API secrets');
  }
  const url = new URL('postgresql://zaping_qa@zaping-qa-postgres:5432/' + TARGET);
  url.password = env.POSTGRES_PASSWORD;
  url.searchParams.set('schema', 'public');
  assert.equal(url.hostname, 'zaping-qa-postgres');
  assert.equal(url.pathname, '/' + TARGET);
  assert.equal(url.port, '5432');
  return url.toString();
}

function signJwt(user, secret, now = Math.floor(Date.now() / 1000)) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    sub: user.id, companyId: user.companyId, email: user.email, role: user.role,
    authVersion: user.authVersion, iat: now, exp: now + 900,
  })).toString('base64url');
  const unsigned = header + '.' + body;
  return unsigned + '.' + createHmac('sha256', secret).update(unsigned).digest('base64url');
}

async function request(path, token) {
  const response = await fetch(URL_BASE + path, {
    headers: token ? { Authorization: 'Bearer ' + token } : undefined,
    signal: AbortSignal.timeout(5000),
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* never log response body */ }
  return { status: response.status, data };
}

async function ready(child) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('Isolated Nest process exited during startup');
    }
    try {
      const response = await request('/health/ready');
      if (response.status === 200 && response.data?.status === 'ok') return;
    } catch { /* startup not complete */ }
    await delay(500);
  }
  throw new Error('Isolated Nest readiness timed out');
}

async function main() {
  assert.equal(process.cwd(), '/app');
  const dbUrl = databaseUrl(process.env);
  const secret = randomBytes(48).toString('hex');
  const childEnv = {
    NODE_ENV: 'test', DATABASE_URL: dbUrl, JWT_SECRET: secret,
    FRONTEND_ORIGIN: 'http://localhost:3000',
    FRONTEND_BASE_URL: 'http://localhost:3000',
    INVENTORY_AUTHORITY_PROTOCOL: 'inventory-authority-v1',
    INVENTORY_RUNTIME_BUILD: 'issue284-functional-v3',
    INVENTORY_RUNTIME_ENVIRONMENT: 'isolated-rehearsal',
    PORT: '3001', TRUST_PROXY_HOPS: '0',
  };
  const { PrismaClient } = createRequire('/app/package.json')('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  let api;
  let checks = 0;

  try {
    const identity = await prisma.$queryRawUnsafe('SELECT current_database() AS db, current_user AS username');
    assert.equal(identity.length, 1);
    assert.equal(identity[0].db, TARGET);
    assert.equal(identity[0].username, 'zaping_qa');

    const migrations = await prisma.$queryRawUnsafe(
      'SELECT COUNT(*)::int AS count FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    assert.equal(migrations[0].count, 54);
    const r2 = await prisma.$queryRawUnsafe(
      "SELECT COUNT(*)::int AS count FROM public._prisma_migrations WHERE migration_name = '" + HISTORICAL_R2 + "'",
    );
    assert.equal(r2[0].count, 0);
    const tables = await prisma.$queryRawUnsafe(
      "SELECT COUNT(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename IN ('ZapingFile','ZapingFileEvent','ZapingFileReceiptLink')",
    );
    assert.equal(tables[0].count, 0);

    const companies = await prisma.company.findMany({ select: { id: true } });
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, companyId: true, email: true, role: true, authVersion: true },
    });
    assert.equal(companies.length, 2);
    assert.equal(users.length, 5);
    assert.ok(users.every((user) => companies.some((company) => company.id === user.companyId)));
    const models = [
      'company', 'user', 'customer', 'product', 'purchase',
      'purchaseReceipt', 'quote', 'sale', 'healthcareCase',
    ];
    const snapshot = () => Promise.all(models.map((model) => prisma[model].count()));
    const before = await snapshot();
    assert.deepEqual(before.slice(0, 3), [2, 5, 4]);
    api = spawn(process.execPath, ['dist/src/main.js'], {
      cwd: '/app', env: childEnv, stdio: ['ignore', 'ignore', 'ignore'],
    });
    await ready(api);
    checks++;
    assert.equal((await request('/health/live')).status, 200);
    assert.equal((await request('/auth/me')).status, 401);
    assert.equal((await request('/customers')).status, 401);
    checks += 3;

    const routes = [
      { path: '/customers', roles: ['ADMIN','MANAGER','SALES'], model: 'customer', active: true },
      { path: '/products', roles: ['ADMIN','MANAGER','SALES','WAREHOUSE'], model: 'product', active: true },
      { path: '/purchases', roles: ['ADMIN','MANAGER','WAREHOUSE'], model: 'purchase' },
      { path: '/purchase-receipts', roles: ['ADMIN','MANAGER','WAREHOUSE'], model: 'purchaseReceipt' },
      { path: '/quotes', roles: ['ADMIN','MANAGER','SALES'], model: 'quote' },
      { path: '/sales', roles: ['ADMIN','MANAGER','SALES'], model: 'sale' },
      { path: '/healthcare/cases', roles: ['ADMIN','MANAGER','SALES','WAREHOUSE'], model: 'healthcareCase' },
    ];

    const actualRoles = new Set(users.map((user) => user.role));
    for (const role of ['ADMIN','MANAGER','SALES','WAREHOUSE']) {
      assert.ok(actualRoles.has(role), 'Expected QA role absent: ' + role);
    }

    for (const user of users) {
      const token = signJwt(user, secret);
      const session = await request('/auth/me', token);
      assert.equal(session.status, 200, 'auth/me failed for ' + user.role);
      assert.equal(session.data?.id, user.id);
      assert.equal(session.data?.companyId, user.companyId);
      checks++;

      for (const route of routes) {
        const allowed = route.roles.includes(user.role);
        const response = await request(route.path, token);
        assert.equal(response.status, allowed ? 200 : 403,
          route.path + ' failed role check: ' + user.role);
        if (allowed) {
          assert.ok(Array.isArray(response.data), route.path + ' expected array');
          const expectedCount = await prisma[route.model].count({
            where: {
              companyId: user.companyId,
              ...(route.active ? { isActive: true } : {}),
            },
          });
          assert.equal(response.data.length, expectedCount, route.path + ' count');
          assert.ok(response.data.every((row) => row.companyId === user.companyId),
            route.path + ' includes foreign tenant data');
        }
        checks++;
      }

      if (user.role !== 'WAREHOUSE') {
        const foreignCustomer = await prisma.customer.findFirst({
          where: { companyId: { not: user.companyId } },
          select: { id: true },
        });
        assert.ok(foreignCustomer, 'Other tenant should have customers');
        assert.equal((await request('/customers/' + foreignCustomer.id, token)).status, 404);
        checks++;
      }
    }
    assert.deepEqual(await snapshot(), before, 'Read-only API run changed row counts');
    console.log('PASS: isolated API ready; JWT/RBAC; tenant-scoped customer, products, purchases, receipts, quotes, sales and healthcare reads');
    console.log('Checks:', checks, 'Companies: 2, users: 5; 54 migrations; 0 R2');
    console.log('HOLD: synthetic tokens are not a password-login test; writes, R2 binaries and cutover are NOT validated');
  } finally {
    if (api && api.exitCode === null && api.signalCode === null) api.kill('SIGTERM');
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    // Never print DB URL, password, emails, or JWT.
    console.error('FUNCTIONAL CHECK FAILED:', error instanceof Error ? error.message.slice(0, 220) : 'unknown');
    process.exitCode = 1;
  });
}

module.exports = { databaseUrl, signJwt };
