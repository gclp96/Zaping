'use strict';

/**
 * Issue 284: minimal real-login + customer/purchase WRITE smoke in disposable
 * zaping_issue284_write_trial_v1 ONLY. Never run on operational QA or v3.
 * No published ports, real credentials, third-party providers or migrations.
 */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');

const TARGET = 'zaping_issue284_write_trial_v1';
const BASE = 'http://127.0.0.1:3001';
const R2 = '20261113190000_zaping_files_r2_v1';

function trialUrl(env) {
  const forbidden = [
    'DATABASE_URL', 'JWT_SECRET', 'RESEND_API_KEY', 'POSTALKIT_API_KEY',
    'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ];
  if (
    env.NODE_ENV !== 'test' || env.POSTGRES_USER !== 'zaping_qa' ||
    env.POSTGRES_DB !== 'zaping_qa' || !env.POSTGRES_PASSWORD ||
    forbidden.some((key) => Boolean(env[key]))
  ) throw new Error('STOP: unexpected environment identity or operational secrets');
  const url = new URL('postgresql://zaping_qa@zaping-qa-postgres:5432/' + TARGET);
  url.password = env.POSTGRES_PASSWORD;
  url.searchParams.set('schema', 'public');
  assert.equal(url.hostname, 'zaping-qa-postgres');
  assert.equal(url.pathname, '/' + TARGET);
  return url.toString();
}

async function http(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  const raw = await response.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* no body logging */ }
  return { status: response.status, data };
}
async function waitForApi(process) {
  for (let i = 0; i < 80; i++) {
    if (process.exitCode !== null || process.signalCode !== null) {
      throw new Error('STOP: isolated API exited on startup');
    }
    try {
      const result = await http('/health/ready');
      if (result.status === 200 && result.data?.status === 'ok') return;
    } catch { /* still starting */ }
    await delay(500);
  }
  throw new Error('STOP: readiness timeout');
}
function expectStatus(response, status, label) {
  assert.equal(response.status, status, label + ': unexpected HTTP status');
}
async function login(email, password) {
  const result = await http('/auth/login', { method: 'POST', body: { email, password } });
  expectStatus(result, 201, 'password login');
  assert.ok(typeof result.data?.token === 'string' && result.data.token.length > 30);
  return result.data.token;
}

async function main() {
  assert.equal(process.cwd(), '/app');
  const dbUrl = trialUrl(process.env);
  const secret = randomBytes(48).toString('hex');
  const { PrismaClient } = createRequire('/app/package.json')('@prisma/client');
  const bcrypt = createRequire('/app/package.json')('bcrypt');
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  let api;
  try {
    const identity = await prisma.$queryRawUnsafe('SELECT current_database() AS db, current_user AS username');
    assert.equal(identity[0]?.db, TARGET);
    assert.equal(identity[0]?.username, 'zaping_qa');
    const migrations = await prisma.$queryRawUnsafe(
      'SELECT count(*)::int AS count FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    const r2 = await prisma.$queryRawUnsafe(
      "SELECT count(*)::int AS count FROM public._prisma_migrations WHERE migration_name = '" + R2 + "'",
    );
    const r2Tables = await prisma.$queryRawUnsafe(
      "SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename IN ('ZapingFile','ZapingFileEvent','ZapingFileReceiptLink')",
    );
    assert.equal(migrations[0]?.count, 54);
    assert.equal(r2[0]?.count, 0);
    assert.equal(r2Tables[0]?.count, 0);

    const [companyCount, userCount, customerCount, purchaseCount, purchaseItemCount] = await Promise.all([
      prisma.company.count(), prisma.user.count(), prisma.customer.count(),
      prisma.purchase.count(), prisma.purchaseItem.count(),
    ]);
    assert.deepEqual([companyCount, userCount, customerCount, purchaseCount, purchaseItemCount], [2, 5, 4, 7, 7]);

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, companyId: true, role: true, email: true },
    });
    assert.equal(users.length, 5);
    const tenants = [...new Set(users.map((user) => user.companyId))];
    assert.equal(tenants.length, 2);
    const first = tenants.find((id) => users.filter((u) => u.companyId === id).length === 4);
    const second = tenants.find((id) => users.filter((u) => u.companyId === id).length === 1);
    assert.ok(first && second && first !== second, 'Expected 4/1 QA users by tenant');
    const admin = users.find((user) => user.companyId === first && user.role === 'ADMIN');
    const other = users.find((user) => user.companyId === second);
    assert.ok(admin && other, 'Required tenant users not found');

    const supplier = await prisma.supplier.findFirst({ where: { companyId: first }, select: { id: true } });
    const foreignSupplier = await prisma.supplier.findFirst({ where: { companyId: second }, select: { id: true } });
    const product = await prisma.product.findFirst({ where: { companyId: first, isActive: true }, select: { id: true } });
    assert.ok(supplier && foreignSupplier && product, 'Missing test supplier/product in restored data');

    // Change only two password hashes in the DISPOSABLE clone. Never show
    // passwords, JWTs, email addresses or database connection strings.
    const passwordA = randomBytes(24).toString('base64url');
    const passwordB = randomBytes(24).toString('base64url');
    for (const [user, password] of [[admin, passwordA], [other, passwordB]]) {
      const changed = await prisma.user.updateMany({
        where: { id: user.id, companyId: user.companyId, isActive: true },
        data: { passwordHash: await bcrypt.hash(password, 10) },
      });
      assert.equal(changed.count, 1, 'Password setup in clone');
    }

    api = spawn(process.execPath, ['dist/src/main.js'], {
      cwd: '/app',
      env: {
        NODE_ENV: 'test', DATABASE_URL: dbUrl, JWT_SECRET: secret,
        FRONTEND_ORIGIN: 'http://localhost:3000',
        FRONTEND_BASE_URL: 'http://localhost:3000',
        INVENTORY_AUTHORITY_PROTOCOL: 'inventory-authority-v1',
        INVENTORY_RUNTIME_BUILD: 'issue284-write-trial-v1',
        INVENTORY_RUNTIME_ENVIRONMENT: 'isolated-rehearsal',
        PORT: '3001', TRUST_PROXY_HOPS: '0',
      },
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    await waitForApi(api);

    const tokenA = await login(admin.email, passwordA);
    const tokenB = await login(other.email, passwordB);
    expectStatus(await http('/auth/login', {
      method: 'POST', body: { email: admin.email, password: passwordB },
    }), 401, 'wrong password rejected');
    const meA = await http('/auth/me', { token: tokenA });
    expectStatus(meA, 200, 'admin session');
    assert.equal(meA.data?.companyId, first);

    const unique = randomBytes(6).toString('hex');
    const created = await http('/customers', {
      method: 'POST', token: tokenA,
      body: { name: 'Issue284 write check ' + unique, type: 'BUSINESS' },
    });
    expectStatus(created, 201, 'create customer');
    assert.equal(created.data?.companyId, first);
    assert.ok(created.data?.id);
    const customerId = created.data.id;
    const ownCustomer = await http('/customers/' + customerId, { token: tokenA });
    expectStatus(ownCustomer, 200, 'read created customer');
    assert.equal(ownCustomer.data?.id, customerId);

    const modified = await http('/customers/' + customerId, {
      method: 'PATCH', token: tokenA, body: { notes: 'Issue284 isolated update ' + unique },
    });
    expectStatus(modified, 200, 'update customer');
    assert.equal(modified.data?.notes, 'Issue284 isolated update ' + unique);

    const customerForeign = await http('/customers/' + customerId, { token: tokenB });
    expectStatus(customerForeign, other.role === 'WAREHOUSE' ? 403 : 404, 'foreign customer blocked');
    const foreignEdit = await http('/customers/' + customerId, {
      method: 'PATCH', token: tokenB, body: { notes: 'Must be rejected' },
    });
    expectStatus(foreignEdit, other.role === 'WAREHOUSE' ? 403 : 404, 'foreign customer edit blocked');

    const po = await http('/purchases', {
      method: 'POST', token: tokenA,
      body: { supplierId: supplier.id, items: [{ productId: product.id, quantity: 1 }] },
    });
    expectStatus(po, 201, 'create purchase');
    assert.equal(po.data?.companyId, first);
    assert.equal(po.data?.items?.length, 1);
    const purchaseId = po.data.id;
    expectStatus(await http('/purchases/' + purchaseId, { token: tokenA }), 200, 'read purchase');
    expectStatus(await http('/purchases/' + purchaseId, { token: tokenB }), 404, 'foreign purchase blocked');

    expectStatus(await http('/purchases', {
      method: 'POST', token: tokenA,
      body: { supplierId: foreignSupplier.id, items: [{ productId: product.id, quantity: 1 }] },
    }), 404, 'foreign supplier rejected');

    const [customersAfter, purchasesAfter, itemsAfter, crossTenantCustomers, crossTenantPurchases] = await Promise.all([
      prisma.customer.count(), prisma.purchase.count(), prisma.purchaseItem.count(),
      prisma.customer.count({ where: { companyId: second } }),
      prisma.purchase.count({ where: { companyId: second } }),
    ]);
    assert.deepEqual([customersAfter, purchasesAfter, itemsAfter], [5, 8, 8]);
    assert.equal(await prisma.customer.count({ where: { id: customerId, companyId: first } }), 1);
    assert.equal(await prisma.purchaseItem.count({ where: { purchaseId, companyId: first } }), 1);
    assert.equal(await prisma.customer.count({ where: { id: customerId, companyId: second } }), 0);
    assert.equal(await prisma.purchase.count({ where: { id: purchaseId, companyId: second } }), 0);
    assert.equal(crossTenantCustomers, 1);
    assert.equal(crossTenantPurchases, 2);

    console.log('PASS: real password login, invalid password, customer create/update, purchase create, foreign-tenant 403/404, persisted relations');
    console.log('PASS: write trial data 2 companies, 5 users, 5 customers, 8 purchases, 8 purchase items; 54 migrations; 0 R2');
    console.log('HOLD: only disposable write trial was modified; no cutover, operational QA, frontend, R2 or production validated');
  } finally {
    if (api && api.exitCode === null && api.signalCode === null) api.kill('SIGTERM');
    await prisma.$disconnect();
  }
}
if (require.main === module) {
  main().catch((e) => {
    // Exceptions must not reveal secrets or data; just a bounded diagnostic.
    console.error('WRITE CHECK FAILED:', e instanceof Error ? e.message.slice(0, 180) : 'unknown');
    process.exitCode = 1;
  });
}
module.exports = { trialUrl };
