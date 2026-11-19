'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const {
  validateArchiveList, ARG, CANDIDATE,
} = require('./issue284-prepare-qa-candidate.cjs');

function validArchive() {
  const required = [
    '_prisma_migrations', 'Company', 'Customer', 'Purchase',
    'PurchaseReceipt', 'HealthcareCase',
  ];
  const extras = Array.from({ length: 52 }, (_, i) => 'OtherTable' + i);
  return [...required, ...extras].map((name, i) =>
    (i + 100) + '; 0 12345 TABLE DATA public ' + name + ' zaping_qa',
  ).join('\n');
}

test('candidate archive is a full schema/data dump with 58 TABLE DATA objects', () => {
  assert.equal(validateArchiveList(validArchive()), 58);
  assert.throws(() => validateArchiveList(validArchive().replace(
    'TABLE DATA public _prisma_migrations ', 'TABLE DATA public LostTable ',
  )), /STOP:/);
  assert.throws(() => validateArchiveList(validArchive() +
    '\n999; 0 12345 TABLE DATA public Extra zaping_qa'), /STOP:/);
});

test('candidate archive rejects experimental R2 metadata', () => {
  assert.throws(() => validateArchiveList(
    validArchive() + '\n1; 0 4 TABLE public ZapingFile',
  ), /STOP:/);
  assert.throws(() => validateArchiveList(
    validArchive().replace('OtherTable0', 'ZapingFileReceiptLink'),
  ), /STOP:/);
});

test('candidate name cannot equal original and the action requires explicit opt-in', () => {
  assert.equal(ARG, '--prepare-candidate-v1');
  assert.equal(CANDIDATE, 'zaping_qa_official_candidate_v1');
  assert.notEqual(CANDIDATE, 'zaping_qa');
});

test('candidate runner has strict guards and cannot overwrite or activate QA', () => {
  const source = readFileSync(__dirname + '/issue284-prepare-qa-candidate.cjs', 'utf8');
  assert.match(source, /issue284-cutover-preflight\.cjs/);
  assert.match(source, /assertCandidateAbsent\(op\)/);
  assert.match(source, /--single-transaction/);
  assert.match(source, /--exit-on-error/);
  assert.match(source, /--no-owner/);
  assert.match(source, /--no-acl/);
  assert.match(source, /PGOPTIONS=-c default_transaction_read_only=on/);
  assert.match(source, /verifyTableFingerprints/);
  assert.doesNotMatch(source, /--disable-triggers|--clean|--if-exists/);
  assert.doesNotMatch(source, /\bDROP\s+(?:DATABASE|TABLE)\b|migrate reset|migrate resolve|db push|down -v/);
  assert.doesNotMatch(source, /api\.env.*writeFile|writeFile.*api\.env/);
});
