'use strict';

/**
 * Issue #284 read-only proof of effective QA API DB after controlled switch.
 * Runs INSIDE the QA API container without changing its env or migrations.
 */
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const TARGETS = {
  '--candidate': ['zaping_qa_official_candidate_v1', 54, 0],
  '--original': ['zaping_qa', 55, 1],
};
function chooseTarget(flag) {
  assert.ok(Object.hasOwn(TARGETS, flag), 'STOP: invalid target mode');
  return TARGETS[flag];
}
async function main() {
  assert.equal(process.cwd(), '/app', 'STOP: wrong runtime directory');
  assert.equal(process.env.NODE_ENV, 'development', 'STOP: non-QA runtime');
  assert.equal(process.argv.length, 3, 'STOP: expected one mode');
  const [target, count, r2] = chooseTarget(process.argv[2]);
  let url;
  try { url = new URL(process.env.DATABASE_URL); }
  catch { throw new Error('STOP: unexpected DATABASE_URL'); }
  assert.ok(['postgresql:', 'postgres:'].includes(url.protocol));
  assert.equal(url.hostname, 'zaping-qa-postgres');
  assert.equal(url.port, '5432');
  assert.equal(url.username, 'zaping_qa');
  assert.ok(url.password);
  assert.equal(url.pathname, '/' + target);
  const { PrismaClient } = createRequire('/app/package.json')('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const identity = await prisma.$queryRawUnsafe(
      'SELECT current_database() AS db, current_user AS username',
    );
    assert.equal(identity[0]?.db, target, 'STOP: API connected to wrong database');
    assert.equal(identity[0]?.username, 'zaping_qa');
    const state = await prisma.$queryRawUnsafe(
      'SELECT COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS official, ' +
      "COUNT(*) FILTER (WHERE migration_name = '20261113190000_zaping_files_r2_v1' " +
      'AND finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS experimental ' +
      'FROM public._prisma_migrations',
    );
    assert.equal(state[0]?.official, count);
    assert.equal(state[0]?.experimental, r2);
    console.log('PASS: running QA API targets ' + target + '; expected migration history verified');
    console.log('HOLD: no DB writes performed; validate interactive login in web application');
  } finally { await prisma.$disconnect(); }
}
if (require.main === module) {
  main().catch(() => {
    console.error('STOP: effective QA API database verification failed; preserve logs and rollback if needed');
    process.exitCode = 1;
  });
}
module.exports = { chooseTarget };
