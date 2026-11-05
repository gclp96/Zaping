import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQaEnvelope as validate, LIMITS } from './qa-contract.mjs';
const h = 'a'.repeat(64), g = 'b'.repeat(40);
const content = () => ({ size: 12, sha256: h });
function fixture() {
  const e = { schemaVersion: 1, repository: 'gclp96/zaping', issueNumber: 246, approvedIssueSha256: h,
    branch: 'codex/agent-issue-246', baseSha: g, headSha: g, worktreeId: h,
    diffSha256: h, snapshotSha256: h, fingerprintSha256: h,
    scope: { authority: 'OPERATOR', operatorId: 'synthetic-operator', issueNumber: 246, approvedIssueSha256: h,
      allowedPaths: ['a.txt', 'b.txt', 'c.txt', 'old.txt', 'new.txt'], forbiddenPaths: ['secret.txt'] },
    inventory: ['M ', ' M', '??', 'R '].map((status, i) => ({ path: ['a.txt', 'b.txt', 'c.txt', 'new.txt'][i], status,
      kind: 'REGULAR', ...content(), base: status === '??' ? null : content(), index: ['M ', 'R '].includes(status) ? content() : null,
      excluded: null, evidenceGaps: [], ...(status === 'R ' ? { originalPath: 'old.txt' } : {}) })), limitations: [] };
  const binding = Object.fromEntries(['repository', 'issueNumber', 'approvedIssueSha256', 'branch', 'baseSha', 'headSha', 'worktreeId', 'diffSha256', 'snapshotSha256', 'fingerprintSha256'].map(k => [k, e[k]]));
  e.checks = [{ name: 'synthetic-test', status: 'PASS', source: { kind: 'LOCAL_VERIFIER', id: 'synthetic-run' }, binding }];
  return e;
}
test('synthetic complete staged, unstaged, untracked and rename metadata are reviewable only; pure and deterministic', () => {
  const e = fixture(), before = structuredClone(e);
  const result = validate(e);
  assert.equal(result.status, 'QA_REVIEW'); assert.equal(result.exportablePaths.length, 4);
  assert.deepEqual(e, before); assert.deepEqual(validate(e), result);
  result.envelope.inventory[0].path = 'changed'; assert.deepEqual(e, before);
});
const negatives = {
  repository: e => { e.repository = 'other/zaping'; }, issue: e => { e.issueNumber = Number.MAX_SAFE_INTEGER + 1; },
  zero: e => { e.issueNumber = 0; }, branch: e => { e.branch = 'main'; },
  sha: e => { e.headSha = 'A'.repeat(40); }, hash: e => { e.snapshotSha256 = 'a'.repeat(63); },
  version: e => { e.schemaVersion = 2; }, unknown: e => { e.referencedIssue = { authority: 'OPERATOR' }; },
  scopeMissing: e => { delete e.scope; }, scopeEmpty: e => { e.scope.allowedPaths = []; },
  authority: e => { e.scope.authority = 'REFERENCED_ISSUE'; }, approval: e => { e.scope.approvedIssueSha256 = 'c'.repeat(64); },
  overlap: e => { e.scope.forbiddenPaths.push('a.txt'); }, duplicate: e => { e.inventory.push(e.inventory[0]); },
  scopeDuplicate: e => { e.scope.allowedPaths.push('A.txt'); }, rename: e => { e.inventory[3].originalPath = 'outside.txt'; },
  outside: e => { e.inventory[0].path = 'outside.txt'; }, symlink: e => { e.inventory[0].kind = 'SYMLINK'; },
  junction: e => { e.inventory[0].kind = 'JUNCTION'; }, conflict: e => { e.inventory[0].status = 'UU'; },
  huge: e => { e.inventory[0].size = LIMITS.fileBytes + 1; }, fractional: e => { e.inventory[0].size = 0.5; },
  pathsLimit: e => { e.scope.allowedPaths = Array(1001).fill('x'); }, checksLimit: e => { e.checks = Array(101).fill(e.checks[0]); },
  reasonsLimit: e => { e.limitations = Array(101).fill('x'); }, textLimit: e => { e.scope.operatorId = 'x'.repeat(101); },
  content: e => { e.inventory[0].content = 'never accepted'; }, excluded: e => { e.inventory[0].excluded = true; },
  inventedPass: e => { e.checks[0].status = 'QA_PASS'; }, badBinding: e => { e.checks[0].binding.headSha = 'wrong'; },
};
for (const [name, mutate] of Object.entries(negatives)) test(`blocks ${name}`, () => {
  const e = fixture(); mutate(e); const before = structuredClone(e); const r = validate(e);
  assert.equal(r.status, 'BLOCKED'); assert.equal(r.envelope, null); assert.deepEqual(r.exportablePaths, []); assert.deepEqual(e, before);
});
for (const p of ['../x', '/x', 'a//b', 'a/./b', 'a/../b', 'C:/x', 'a\\b', 'a\n', 'NUL.txt', 'COM1', 'a.', 'a ', '*.txt', 'a/%2e', 'x'.repeat(241)]) {
  test(`unsafe path ${JSON.stringify(p)}`, () => { const e = fixture(); e.scope.allowedPaths = [p]; assert.equal(validate(e).status, 'BLOCKED'); });
}
for (const [name, mutate, reason] of [
  ['default checks', e => { delete e.checks; }, 'CHECK_NOT_RUN'],
  ['default status/binding', e => { delete e.checks[0].status; delete e.checks[0].binding; }, 'CHECK_UNVERIFIED'],
  ['empty checks', e => { e.checks = []; }, 'CHECKS_MISSING'],
  ['old snapshot', e => { e.checks[0].binding.snapshotSha256 = 'c'.repeat(64); }, 'CHECK_UNVERIFIED'],
  ['old issue', e => { e.checks[0].binding.issueNumber = 245; e.checks[0].binding.branch = 'codex/agent-issue-245'; }, 'CHECK_UNVERIFIED'],
  ['index missing', e => { e.inventory[0].index = null; }, 'INDEX_CONTENT_UNAVAILABLE'],
  ['base missing', e => { e.inventory[1].base = null; }, 'BASE_CONTENT_UNAVAILABLE'],
  ['deleted', e => { Object.assign(e.inventory[1], { status: ' D', size: null, sha256: null, base: null }); }, 'DELETED_CONTENT'],
  ['large', e => { e.inventory[0].status = 'MM'; e.inventory[0].size = LIMITS.reviewBytes + 1; }, 'TOO_LARGE'],
  ['ci missing commit', e => { e.checks[0].source.kind = 'GITHUB_CI'; }, 'CHECK_UNVERIFIED'],
  ['ci old commit', e => { e.checks[0].source.kind = 'GITHUB_CI'; e.checks[0].binding.publishedCommitSha = 'c'.repeat(40); }, 'CHECK_UNVERIFIED'],
  ...['BINARY', 'TOO_LARGE', 'POSSIBLE_SECRET'].map(code => [code, e => { e.inventory[0].excluded = code; }, code]),
  ...['FAIL', 'BLOCKED', 'NOT_RUN'].map(status => [status, e => { e.checks[0].status = status; }, `CHECK_${status}`]),
]) test(`insufficient: ${name}`, () => {
  const e = fixture(); mutate(e); const r = validate(e); assert.equal(r.status, 'INSUFFICIENT_EVIDENCE'); assert.ok(r.reasons.includes(reason));
  assert.notEqual(r.status, 'QA_PASS');
  if (e.inventory[0].excluded) assert.ok(!r.exportablePaths.includes('a.txt'));
});
test('CI requires exact published commit and snapshot identity', () => {
  const e = fixture(); e.checks[0].source.kind = 'GITHUB_CI'; e.checks[0].binding.publishedCommitSha = g;
  assert.equal(validate(e).status, 'QA_REVIEW');
});
test('non JSON and missing data fail closed', () => {
  for (const e of [null, [], undefined, {}, { schemaVersion: 1 }, Object.create(null)]) assert.equal(validate(e).status, 'BLOCKED');
});

test('historical PASS never survives normalization as a bound result', () => {
  const e = fixture(); e.checks[0].binding.fingerprintSha256 = 'c'.repeat(64);
  const r = validate(e);
  assert.equal(r.envelope.checks[0].status, 'NOT_RUN');
  assert.equal(r.envelope.checks[0].binding, 'UNVERIFIED');
});
test('deep frozen JSON input is accepted without mutation', () => {
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  assert.equal(validate(freeze(fixture())).status, 'QA_REVIEW');
});
test('missing current content and explicit gaps are insufficient', () => {
  const e = fixture(); Object.assign(e.inventory[2], { size: null, sha256: null, evidenceGaps: ['CONTENT_UNAVAILABLE'] });
  const r = validate(e); assert.equal(r.status, 'INSUFFICIENT_EVIDENCE');
  assert.ok(!r.exportablePaths.includes('c.txt'));
});
test('declared limitations never become QA_REVIEW', () => {
  const e = fixture(); e.limitations = ['Synthetic origin is not attested'];
  assert.ok(validate(e).reasons.includes('DECLARED_LIMITATIONS'));
});
test('an OUT_OF_SCOPE exclusion cannot be used to obtain partial evidence', () => {
  const e = fixture(); e.inventory[0].excluded = 'OUT_OF_SCOPE';
  assert.deepEqual(validate(e).exportablePaths, []); assert.equal(validate(e).status, 'BLOCKED');
});
test('inventory array maximum and invalid binding identity fail closed', () => {
  const e = fixture(); e.inventory = Array(1001).fill(e.inventory[0]); assert.equal(validate(e).status, 'BLOCKED');
  const b = fixture(); b.checks[0].binding.issueNumber = -1; assert.equal(validate(b).status, 'BLOCKED');
});

// QA-CONTRACT-02 independent adversarial review: seven regression cases.
test('untracked entry with base content blocks instead of becoming reviewable', () => {
  const e = fixture(); e.inventory[2].base = content();
  const r = validate(e);
  assert.equal(r.status, 'BLOCKED'); assert.deepEqual(r.reasons, ['INVALID_GIT_METADATA']);
  assert.equal(r.envelope, null); assert.deepEqual(r.exportablePaths, []);
});
test('untracked entry with index content blocks instead of becoming reviewable', () => {
  const e = fixture(); e.inventory[2].index = content();
  const r = validate(e);
  assert.equal(r.status, 'BLOCKED'); assert.deepEqual(r.reasons, ['INVALID_GIT_METADATA']);
  assert.equal(r.envelope, null); assert.deepEqual(r.exportablePaths, []);
});
test('two staged renames cannot reuse the same original path', () => {
  const e = fixture();
  Object.assign(e.inventory[1], { status: 'R ', originalPath: 'old.txt', index: content() });
  const r = validate(e);
  assert.equal(r.status, 'BLOCKED'); assert.deepEqual(r.reasons, ['DUPLICATE_RENAME_SOURCE']);
  assert.equal(r.envelope, null); assert.deepEqual(r.exportablePaths, []);
});
test('a staged and unstaged rename cannot reuse the same original path', () => {
  const e = fixture();
  Object.assign(e.inventory[1], { status: 'RM', originalPath: 'old.txt', index: content() });
  const r = validate(e);
  assert.equal(r.status, 'BLOCKED'); assert.deepEqual(r.reasons, ['DUPLICATE_RENAME_SOURCE']);
});
test('bidirectional override U+202E is rejected in an allowed path', () => {
  const e = fixture(); e.scope.allowedPaths.push('bidi\u202E.txt');
  assert.equal(validate(e).status, 'BLOCKED');
  assert.deepEqual(validate(e).reasons, ['UNSAFE_PATH']);
});
test('zero-width format character U+200B is rejected in inventory path', () => {
  const e = fixture(); e.inventory[0].path = 'a\u200B.txt'; e.scope.allowedPaths[0] = 'a\u200B.txt';
  assert.equal(validate(e).status, 'BLOCKED');
  assert.deepEqual(validate(e).exportablePaths, []);
});
test('empty inventory cannot yield QA_REVIEW even with a bound PASS check', () => {
  const e = fixture(); e.inventory = [];
  const r = validate(e);
  assert.equal(r.status, 'INSUFFICIENT_EVIDENCE');
  assert.deepEqual(r.reasons, ['INVENTORY_EMPTY']);
  assert.equal(r.envelope.checks[0].status, 'PASS');
  assert.deepEqual(r.exportablePaths, []);
});

// Independent review follow-up: index/base metadata must agree with staged-only Git XY.
test('staged addition with base content is invalid Git metadata', () => {
  const e = fixture();
  Object.assign(e.inventory[0], { status: 'A ', base: content(), index: content() });
  assert.deepEqual(validate(e).reasons, ['INVALID_GIT_METADATA']);
  assert.equal(validate(e).status, 'BLOCKED');
});
test('staged-only modification with index different from working content blocks', () => {
  const e = fixture(); e.inventory[0].index.sha256 = 'c'.repeat(64);
  assert.equal(validate(e).status, 'BLOCKED');
  assert.deepEqual(validate(e).reasons, ['INVALID_GIT_METADATA']);
});
test('staged-only rename with index size different from working content blocks', () => {
  const e = fixture(); e.inventory[3].index.size++;
  assert.equal(validate(e).status, 'BLOCKED');
  assert.deepEqual(validate(e).reasons, ['INVALID_GIT_METADATA']);
});
test('staged and unstaged modification may legitimately have distinct index and working content', () => {
  const e = fixture(); e.inventory[0].status = 'MM'; e.inventory[0].index.sha256 = 'c'.repeat(64);
  assert.equal(validate(e).status, 'QA_REVIEW');
});
