'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { digest, crlfBytes, compareHistories } = require('./audit-zaping-files-r2-history.cjs');

test('line-ending variants are byte-distinct and hashable', () => {
  const sql = Buffer.from('CREATE TABLE "Example" (id int);\nSELECT 1;\n');
  const converted = crlfBytes(sql);
  assert.equal(converted.toString('utf8'), 'CREATE TABLE "Example" (id int);\r\nSELECT 1;\r\n');
  assert.notEqual(digest(sql), digest(converted));
  assert.equal(digest(converted).length, 64);
});

test('CRLF normalization does not duplicate carriage returns', () => {
  const sql = Buffer.from('A\r\nB\nC\r\n');
  assert.equal(crlfBytes(sql).toString('utf8'), 'A\r\nB\r\nC\r\n');
});

test('finds migrations applied only in DB without mutating either input', () => {
  const local = ['base', 'later'];
  const applied = ['base', 'r2-unmerged'];
  assert.deepEqual(compareHistories(local, applied), {
    databaseOnly: ['r2-unmerged'],
    repositoryOnly: ['later'],
  });
  assert.deepEqual(local, ['base', 'later']);
  assert.deepEqual(applied, ['base', 'r2-unmerged']);
});

test('matching histories have no divergence', () => {
  assert.deepEqual(compareHistories(['a', 'b'], ['b', 'a']), {
    databaseOnly: [],
    repositoryOnly: [],
  });
});
