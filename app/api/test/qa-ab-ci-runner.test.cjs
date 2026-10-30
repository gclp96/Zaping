const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertRepositoryTarget, baseline } = require('./qa-ab-01.run.cjs');
const candidate = 'a'.repeat(40);
const local = {
  branch: 'codex/insap-auto-01b-foundation-receipts',
  head: baseline,
};
const actions = {
  branch: '',
  head: candidate,
  githubActions: 'true',
  ci: 'true',
  githubSha: candidate,
};

test('local baseline is authorized on the dedicated branch', () =>
  assert.equal(assertRepositoryTarget(local), baseline));
test('local committed candidate needs its exact authorized SHA', () =>
  assert.equal(
    assertRepositoryTarget({
      ...local,
      head: candidate,
      expectedHead: candidate,
    }),
    candidate,
  ));
test('another local branch is rejected before creating a server', () =>
  assert.throws(() => assertRepositoryTarget({ ...local, branch: 'main' })));

test('receipt links QA requires its dedicated branch and explicit exact SHA', () => {
  const links = {
    branch: 'codex/zfiles-int-02a-receipt-links',
    head: candidate,
  };
  assert.equal(
    assertRepositoryTarget({ ...links, expectedHead: candidate }),
    candidate,
  );
  assert.throws(() => assertRepositoryTarget(links));
  assert.throws(() =>
    assertRepositoryTarget({ ...links, expectedHead: baseline }),
  );
  assert.throws(() =>
    assertRepositoryTarget({
      ...links,
      branch: 'main',
      expectedHead: candidate,
    }),
  );
});
test('detached GitHub pull-request merge SHA is accepted exactly', () =>
  assert.equal(assertRepositoryTarget(actions), candidate));
test('GitHub push checkout is accepted without a local branch dependency', () =>
  assert.equal(
    assertRepositoryTarget({ ...actions, branch: 'main' }),
    candidate,
  ));
test('stale GitHub checkout is rejected even with an explicit override', () =>
  assert.throws(() =>
    assertRepositoryTarget({
      ...actions,
      githubSha: baseline,
      expectedHead: candidate,
    }),
  ));
test('stale explicit SHA is rejected', () =>
  assert.throws(() =>
    assertRepositoryTarget({ ...actions, expectedHead: baseline }),
  ));
test('missing or malformed workflow SHA is rejected', () => {
  assert.throws(() =>
    assertRepositoryTarget({ ...actions, githubSha: undefined }),
  );
  assert.throws(() =>
    assertRepositoryTarget({ ...actions, githubSha: 'HEAD' }),
  );
});

test('runner exits nonzero on a failed repository assertion before provisioning PostgreSQL', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  const result = spawnSync(
    process.execPath,
    [require.resolve('./qa-ab-01.run.cjs'), '--upgrade-only'],
    {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'false',
        CI: 'false',
        QA_AB_EXPECTED_HEAD: '0'.repeat(40),
      },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HEAD differs from the authorized SHA/);
  assert.doesNotMatch(result.stdout, /Creating fresh tmpfs PostgreSQL/);
});
