'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  identifier,
  listFromSql,
  officialTableNames,
  countAndFingerprintSql,
  restoreWithQualifiedSearchPath,
  restoreSqlArgs,
} = require('./rehearse-issue284-official-data.cjs');

test('double-quotes only validated PostgreSQL identifiers', () => {
  assert.equal(identifier('Company'), '"Company"');
  assert.equal(identifier('_prisma_migrations'), '"_prisma_migrations"');
  assert.throws(() => identifier('Company"; DROP DATABASE "qa'), /invalid/);
  assert.throws(() => identifier('bad.name'), /invalid/);
});

test('parses PostgreSQL table lists without blank lines', () => {
  assert.deepEqual(listFromSql('Company\nCustomer\n\n'), ['Company', 'Customer']);
});

test('rejects R2 and migration-history tables from export', () => {
  const official = Array.from({ length: 22 }, (_, i) => 'Table' + i);
  assert.equal(officialTableNames(official.join('\n')).length, 22);
  for (const excluded of [
    '_prisma_migrations',
    'ZapingFile',
    'ZapingFileEvent',
    'ZapingFileReceiptLink',
  ]) {
    assert.throws(
      () => officialTableNames([...official, excluded].join('\n')),
      /not recognized/,
    );
  }
  assert.throws(() => officialTableNames('Company\nCustomer'), /not recognized/);
});

test('fingerprint query only references a validated table name', () => {
  const sql = countAndFingerprintSql(identifier('Customer'));
  assert.match(sql, /FROM public\."Customer" t;/);
  assert.match(sql, /COUNT\(\*\)/);
  assert.match(sql, /string_agg/);
  assert.doesNotMatch(sql, /DELETE|UPDATE|INSERT/);
});

test('sets public search_path only after recognized pg_restore header', () => {
  const script = [
    '-- PostgreSQL database dump',
    "SELECT pg_catalog.set_config('search_path', '', false);",
    'COPY public."Company" ("id") FROM stdin;',
    'abc',
    '\\.',
    '',
  ].join('\n');
  const patched = restoreWithQualifiedSearchPath(script);
  assert.equal(
    patched,
    script.replace(
      "SELECT pg_catalog.set_config('search_path', '', false);",
      "SELECT pg_catalog.set_config('search_path', '', false);\nSET search_path = pg_catalog, public;",
    ),
  );
  assert.equal((patched.match(/SET search_path = pg_catalog, public;/g) || []).length, 1);
  assert.match(patched, /COPY public\."Company"/);
  assert.match(patched, /abc\n/);
  assert.doesNotMatch(patched, /disable-triggers|session_replication_role/i);
});

test('refuses missing or unexpected pg_restore search_path statements', () => {
  assert.throws(
    () => restoreWithQualifiedSearchPath('COPY public."Company" FROM stdin;\n\\.'),
    /unexpected pg_restore search_path/,
  );
  const reset = "SELECT pg_catalog.set_config('search_path', '', false);";
  assert.throws(
    () => restoreWithQualifiedSearchPath(reset + '\n' + reset),
    /unexpected pg_restore search_path/,
  );
  assert.throws(
    () => restoreWithQualifiedSearchPath(reset + '\nSET search_path = public;'),
    /unexpected pg_restore search_path/,
  );
});

test('pg_restore custom archive renders SQL to stdout without accessing a database', () => {
  const args = restoreSqlArgs('/tmp/issue284-official-data-123e4567-e89b-12d3-a456-426614174000.dump');
  assert.deepEqual(args, [
    'pg_restore', '--data-only', '--no-owner', '--no-acl', '--file=-',
    '/tmp/issue284-official-data-123e4567-e89b-12d3-a456-426614174000.dump',
  ]);
  assert.ok(args.includes('--file=-'));
  assert.ok(!args.includes('-d') && !args.includes('--dbname'));
  assert.throws(() => restoreSqlArgs('/tmp/other.dump'), /unexpected archive path/);
});
