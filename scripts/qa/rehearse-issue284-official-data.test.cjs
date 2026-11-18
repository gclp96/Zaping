'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  identifier,
  listFromSql,
  officialTableNames,
  countAndFingerprintSql,
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
