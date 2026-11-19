'use strict';

/**
 * Issue 284 — READ ONLY candidate connectivity from the existing QA API
 * container. Never run from host, production or rehearsal.
 *
 * The running API keeps using its original DATABASE_URL. This one-shot
 * process derives a candidate URL only IN MEMORY and never logs secrets.
 * No API restart, migration, writes or external services.
 *
 * docker compose -f docker-compose.qa.yml exec -T api \
 *   node /qa-tools/issue284-api-candidate-connection-check.cjs
 */
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');

const SOURCE = 'zaping_qa';
const TARGET = 'zaping_qa_official_candidate_v1';
const HISTORICAL_R2 = '20261113190000_zaping_files_r2_v1';

function prepareUrls(env) {
  if (env.NODE_ENV !== 'development') {
    throw new Error('STOP: unexpected runtime environment');
  }
  if (!env.DATABASE_URL) {
    throw new Error('STOP: missing QA API database configuration');
  }
  let original;
  try { original = new URL(env.DATABASE_URL); }
  catch { throw new Error('STOP: invalid QA API database configuration'); }

  if (!['postgresql:', 'postgres:'].includes(original.protocol) ||
      original.hostname !== 'zaping-qa-postgres' ||
      original.port !== '5432' ||
      original.pathname !== '/' + SOURCE ||
      original.username !== 'zaping_qa' ||
      !original.password ||
      (original.searchParams.has('schema') &&
       original.searchParams.get('schema') !== 'public')) {
    throw new Error('STOP: QA API is not configured for the expected original database');
  }
  const candidate = new URL(original);
  candidate.pathname = '/' + TARGET;
  return { source: original.toString(), candidate: candidate.toString() };
}

function digestUsers(users) {
  assert.equal(users.length, 5, 'STOP: expected five QA users');
  const ids = new Set();
  const serialized = users
    .map(user => {
      assert.ok(user.id && user.companyId && user.email && user.passwordHash);
      assert.ok(!ids.has(user.id), 'STOP: duplicate user ID');
      ids.add(user.id);
      return [user.id, user.companyId, user.email, user.passwordHash,
        user.role, user.authVersion, user.isActive];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));
  return createHash('sha256').update(JSON.stringify(serialized)).digest('hex');
}

async function inspect(prisma, expectedDb, expectedMigrations, expectedR2) {
  const identity = await prisma.$queryRawUnsafe(
    'SELECT current_database() AS db, current_user AS username',
  );
  assert.equal(identity.length, 1);
  assert.equal(identity[0].db, expectedDb, 'STOP: unexpected connected DB');
  assert.equal(identity[0].username, 'zaping_qa', 'STOP: unexpected DB user');

  const migrations = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS n FROM public._prisma_migrations ' +
    'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  );
  assert.equal(migrations[0]?.n, expectedMigrations,
    'STOP: migration count mismatch');
  const r2 = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*)::int AS n FROM public._prisma_migrations " +
    "WHERE migration_name = '" + HISTORICAL_R2 + "' " +
    'AND finished_at IS NOT NULL AND rolled_back_at IS NULL',
  );
  assert.equal(r2[0]?.n, expectedR2, 'STOP: R2 history mismatch');

  const r2Tables = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*)::int AS n FROM pg_catalog.pg_tables " +
    "WHERE schemaname = 'public' AND tablename IN " +
    "('ZapingFile','ZapingFileReceiptLink','ZapingFileEvent')",
  );
  assert.equal(r2Tables[0]?.n, expectedR2 === 0 ? 0 : 3,
    'STOP: unexpected R2 tables');

  const companies = await prisma.company.count();
  const users = await prisma.user.findMany({
    select: {
      id: true, companyId: true, email: true,
      passwordHash: true, role: true, authVersion: true, isActive: true,
    },
  });
  const customers = await prisma.customer.count();
  assert.deepEqual([companies, users.length, customers], [2, 5, 4],
    'STOP: expected QA data not found');
  return digestUsers(users);
}

async function main() {
  assert.equal(process.cwd(), '/app', 'STOP: not running in QA API working directory');
  const { source, candidate } = prepareUrls(process.env);
  const { PrismaClient } = createRequire('/app/package.json')('@prisma/client');
  const old = new PrismaClient({ datasources: { db: { url: source } } });
  const next = new PrismaClient({ datasources: { db: { url: candidate } } });
  try {
    const first = await inspect(old, SOURCE, 55, 1);
    const second = await inspect(next, TARGET, 54, 0);
    assert.equal(second, first,
      'STOP: candidate user credentials, roles or auth versions differ');
    console.log('PASS: running QA API container can connect to official candidate (read-only)');
    console.log('PASS: 54 official migrations, 0 R2; all five user credentials/roles/auth versions match original QA');
    console.log('HOLD: no API restart, no env changes, no cutover; real interactive password login still required after switch');
  } finally {
    await Promise.allSettled([old.$disconnect(), next.$disconnect()]);
  }
}
if (require.main === module) {
  main().catch(() => {
    // Generic message on purpose: a Prisma error can include connection details.
    console.error('STOP: runtime candidate connectivity or identity verification failed; preserve QA unchanged');
    process.exitCode = 1;
  });
}
module.exports = { prepareUrls, digestUsers };
