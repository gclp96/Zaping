import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, safePath, validateSpec, preparationSafe, validateChangedPaths, untrackedWhitespaceError, findNpmCli, samePhysicalPath, runReview } from './verify-local.mjs';

const HEAD = 'a'.repeat(40);
function fixture(t, { files = [], untracked = [], fail, dependencies = true, ignored = [], branch, head = HEAD, origin } = {}) {
  const temp = safePath(mkdtempSync(join(tmpdir(), 'verify-local-test-')));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const repo = join(temp, 'checkout');
  const root = join(temp, 'zaping-agent-runs/issue-208');
  const api = join(root, 'app/api');
  const common = join(repo, '.git');
  mkdirSync(common, { recursive: true });
  mkdirSync(join(api, 'src/purchases'), { recursive: true });
  writeFileSync(join(root, '.git'), 'gitdir: simulated');
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(api, 'package.json'), '{"scripts":{"test":"jest"}}');
  writeFileSync(join(api, 'src/purchases/a.spec.ts'), '// test');
  if (dependencies) for (const name of ['jest/bin/jest.js', 'typescript/bin/tsc', 'eslint/bin/eslint.js', '.prisma/client/index.js', 'prisma/build/index.js']) {
    const path = join(api, 'node_modules', name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, '');
  }
  const calls = [];
  const snapshots = [];
  const run = (binary, argv, options) => {
    calls.push({ binary, argv, options });
    const failure = fail?.(binary, argv, options);
    if (failure) return failure;
    let stdout = '';
    if (binary === 'git') {
      const args = argv.slice(3);
      if (args[0] === 'remote') stdout = origin ?? 'https://github.com/gclp96/zaping.git';
      else if (args.includes('--git-common-dir')) stdout = common;
      else if (args.includes('--show-toplevel')) stdout = root;
      else if (args[0] === 'worktree') stdout = `worktree ${root}\0HEAD ${HEAD}\0branch refs/heads/codex/agent-issue-208\0\0`;
      else if (args[0] === 'branch') stdout = branch ?? 'codex/agent-issue-208';
      else if (args[0] === 'merge-base') stdout = HEAD;
      else if (args[0] === 'rev-parse') stdout = head;
      else if (args.includes('--name-only')) stdout = files.join('\0');
      else if (args.includes('--ignored')) stdout = ignored.join('\0');
      else if (args.includes('--others')) stdout = untracked.join('\0');
      else if (args[0] === 'status') stdout = files.map(file => ` M ${file}\0`).join('');
    }
    return { status: 0, stdout, stderr: '' };
  };
  return { temp, repo, root, api, calls, snapshots,
    review: (args, extra = {}) => runReview(['--issue', '208', ...args], { repo, temp, run, persist: report => snapshots.push(structuredClone(report)), ...extra }) };
}

test('strict positive issue and separate modes; no arbitrary paths/arguments', () => {
  for (const value of ['0', '-1', '01', '1/../2', '1;echo', '9007199254740992', 'C:\\x']) assert.throws(() => parseArgs(['--issue', value]));
  for (const tail of [['--prepare', '--verify'], ['--verify'], ['--spec', 'x'], ['--prepare', '--force']]) assert.throws(() => parseArgs(['--issue', '208', ...tail]));
  assert.equal(parseArgs(['--issue', '208']).mode, 'inspect');
});

test('inspection executes only read-only git; gates NOT_RUN and no install/test', t => {
  const f = fixture(t);
  const { report, exitCode } = f.review([]);
  assert.equal(exitCode, 0);
  assert.equal(report.status, 'NOT_RUN');
  assert.equal(report.base, HEAD);
  assert.equal(report.dependencies, true);
  assert.ok(report.steps.every(step => step.status === 'NOT_RUN'));
  assert.ok(f.calls.every(call => call.binary === 'git' && call.options.shell === false));
});

test('nonexistent worktree and invalid number never spawn', t => {
  const f = fixture(t);
  for (const issue of ['209', '../208']) {
    const result = runReview(['--issue', issue], { repo: f.repo, temp: f.temp, run: () => assert.fail('spawn'), persist: () => {} });
    assert.equal(result.report.status, 'BLOCKED');
    assert.equal(result.exitCode, 1);
  }
});

test('rejects symlink/junction worktree pointing outside area', t => {
  const f = fixture(t);
  const link = join(f.temp, 'zaping-agent-runs/issue-209');
  try { symlinkSync(f.root, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (error.code !== 'EPERM') throw error;
    t.skip('El sandbox prohíbe crear junctions; cobertura simulada en prueba siguiente');
    return;
  }
  assert.throws(() => safePath(link), /rechazado/);
  const result = runReview(['--issue', '209', '--prepare'], { repo: f.repo, temp: f.temp, run: () => assert.fail('spawn'), persist: () => {} });
  assert.equal(result.exitCode, 1);
});

test('symlink components and realpath escape fail closed (simulated filesystem)', () => {
  assert.throws(() => safePath(join(tmpdir(), 'outside'), { stat: () => ({ isSymbolicLink: () => true }) }), /rechazado/);
  assert.throws(() => safePath(join(tmpdir(), 'outside'), { stat: () => ({ isSymbolicLink: () => false }), realpath: () => 'outside' }), /ruta real/);
});

test('safe focal spec only; traversal, options, paths outside API and links rejected', t => {
  const f = fixture(t);
  for (const spec of ['app/api/src/../a.spec.ts', 'web/a.spec.ts', '/tmp/a.spec.ts', '--help', 'app\\api\\src\\a.spec.ts', 'app/api/src/a.spec.ts;echo', 'app/api/src/missing.spec.ts']) assert.throws(() => validateSpec(f.root, spec));
  assert.equal(validateSpec(f.root, 'app/api/src/purchases/a.spec.ts'), 'src/purchases/a.spec.ts');
});

test('preparation blocks changed/ignored manifests, npm configs, install scripts', t => {
  const protectedFiles = ['package.json', 'app/api/package-lock.json', 'app/api/npm-shrinkwrap.json', '.npmrc', 'app/api/.npmrc', 'scripts/install.mjs', 'app/api/prisma/schema.prisma', 'app/api/node_modules/../.npmrc'];
  for (const file of protectedFiles) {
    assert.equal(preparationSafe([file]), false);
    const f = fixture(t, { files: [file] });
    const result = f.review(['--prepare']);
    assert.equal(result.exitCode, 1, file);
    assert.ok(f.calls.every(call => call.binary === 'git'));
  }
  const f = fixture(t, { ignored: ['app/api/.npmrc'] });
  assert.equal(f.review(['--prepare']).exitCode, 1);
});

test('lifecycle hooks and local dependencies block before npm', t => {
  for (const manifest of [{ scripts: { postinstall: 'node src/install.ts' } }, { dependencies: { unsafe: 'file:../../outside' } }]) {
    const f = fixture(t);
    writeFileSync(join(f.api, 'package.json'), JSON.stringify(manifest));
    assert.equal(f.review(['--prepare']).report.status, 'BLOCKED');
    assert.ok(f.calls.every(call => call.binary === 'git'));
  }
});

test('invalid manifest JSON diagnostic never includes its contents', t => {
  const f = fixture(t);
  writeFileSync(join(f.api, 'package.json'), 'PRIVATE_VALUE_NOT_FOR_REPORT');
  const { report, exitCode } = f.review(['--prepare']);
  assert.equal(exitCode, 1);
  assert.equal(report.status, 'BLOCKED');
  assert.ok(!JSON.stringify(report).includes('PRIVATE_VALUE_NOT_FOR_REPORT'));
});

test('prepare fixed argv and cwd; never verifies implicitly', t => {
  const f = fixture(t, { files: ['app/api/src/purchases/a.spec.ts'] });
  const result = f.review(['--prepare']);
  assert.equal(result.report.status, 'PASS');
  const processes = f.calls.filter(call => call.binary !== 'git');
  assert.equal(processes.length, 2);
  assert.deepEqual(processes[0].argv.slice(1), ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  assert.deepEqual(processes[1].argv[0].split(/[\\/]/).slice(-3), ['prisma', 'build', 'index.js']);
  assert.deepEqual(processes[1].argv.slice(1), ['generate']);
  assert.equal(processes[0].options.env.npm_config_ignore_scripts, 'true');
  assert.ok(processes[0].options.env.npm_config_userconfig.endsWith('user.npmrc'));
  assert.ok(processes[0].options.env.npm_config_globalconfig.endsWith('global.npmrc'));
  assert.ok(!Object.keys(processes[0].options.env).some(key => /token|secret|auth/i.test(key)));
  assert.ok(processes.every(call => call.binary === process.execPath && call.options.cwd === f.api && call.options.shell === false));
  assert.ok(result.report.steps.slice(2).every(step => step.status === 'NOT_RUN'));
});

const verify = ['--verify', '--spec', 'app/api/src/purchases/a.spec.ts'];
test('verify exact argv, cwd, real exits and durations; no install', t => {
  const f = fixture(t);
  const { report, exitCode } = f.review(verify);
  assert.equal(exitCode, 0);
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.steps.slice(2).map(step => step.status), ['PASS', 'PASS', 'PASS', 'PASS']);
  const processes = f.calls.filter(call => call.binary !== 'git');
  assert.deepEqual(processes.map(call => call.argv.slice(1)), [
    ['test', '--', '--runInBand', '--runTestsByPath', 'src/purchases/a.spec.ts'], ['run', 'typecheck'], ['run', 'lint:check'],
  ]);
  assert.ok(processes.every(call => call.options.cwd === f.api && call.options.shell === false));
  assert.ok(report.steps.slice(2).every(step => step.exitCode === 0 && step.durationMs >= 0));
  assert.ok(f.snapshots.slice(0, -1).every(snapshot => snapshot.status === 'BLOCKED'));
});

test('absent dependencies BLOCKED; no Jest/npm implicit fetch', t => {
  const f = fixture(t, { dependencies: false });
  const result = f.review(verify);
  assert.equal(result.report.status, 'BLOCKED');
  assert.equal(result.exitCode, 1);
  assert.ok(f.calls.every(call => call.binary === 'git'));
  assert.ok(result.report.steps.every(step => step.status === 'NOT_RUN'));
});

for (const gate of ['diff', 'jest', 'typecheck', 'lint']) test(`real nonzero ${gate}: FAIL, later gates NOT_RUN`, t => {
  const f = fixture(t, { fail: (binary, args) => {
    if ((gate === 'diff' && binary === 'git' && args.includes('--check')) || (gate === 'jest' && args.includes('test')) || (['typecheck', 'lint'].includes(gate) && args.includes(gate === 'lint' ? 'lint:check' : gate))) return { status: 7, stderr: 'SECRET=do-not-record' };
  } });
  const result = f.review(verify);
  assert.equal(result.report.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  const index = result.report.steps.findIndex(step => step.name === gate);
  assert.equal(result.report.steps[index].exitCode, 7);
  assert.ok(result.report.steps.slice(index + 1).every(step => step.status === 'NOT_RUN'));
  assert.ok(!JSON.stringify(result.report).includes('do-not-record'));
});

test('interrupted, timed out and unspawnable process never PASS', t => {
  for (const failure of [{ status: null, signal: 'SIGINT' }, { status: null, error: { code: 'ETIMEDOUT' } }, { status: null, error: { code: 'ENOENT' } }]) {
    const f = fixture(t, { fail: (binary, args) => args.includes('test') ? failure : null });
    const result = f.review(verify);
    assert.equal(result.report.status, 'BLOCKED');
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.steps[3].exitCode, null);
    assert.equal(result.report.steps[4].status, 'NOT_RUN');
  }
});

test('unexpected branch, origin, or committed changes fail closed', t => {
  for (const options of [{ branch: 'main' }, { head: 'b'.repeat(40) }, { origin: 'https://example.com/repo' }]) {
    const f = fixture(t, options);
    assert.equal(f.review(['--prepare']).exitCode, 1);
    assert.ok(f.calls.every(call => call.binary === 'git'));
  }
});

test('foreign Git common directory, unregistered worktree and wrong root rejected', t => {
  for (const mismatch of ['--git-common-dir', 'worktree', '--show-toplevel']) {
    let count = 0;
    const f = fixture(t, { fail: (_binary, args) => {
      if (mismatch === '--git-common-dir' && args.includes(mismatch) && ++count === 2) return { status: 0, stdout: f.api };
      if (mismatch === 'worktree' && args.includes(mismatch)) return { status: 0, stdout: `worktree ${f.repo}\0` };
      if (mismatch === '--show-toplevel' && args.includes(mismatch)) return { status: 0, stdout: f.repo };
    } });
    assert.equal(f.review(['--prepare']).exitCode, 1);
    assert.ok(f.calls.every(call => call.binary === 'git'));
  }
});

test('prepare stops after failed install; Prisma is NOT_RUN', t => {
  const f = fixture(t, { fail: (_binary, args) => args.includes('ci') ? { status: 9 } : null });
  const { report, exitCode } = f.review(['--prepare']);
  assert.equal(exitCode, 1);
  assert.equal(report.steps[0].status, 'FAIL');
  assert.equal(report.steps[1].status, 'NOT_RUN');
});

test('tracked modification by a successful child prevents overall PASS', t => {
  let diffs = 0;
  const f = fixture(t, { fail: (_binary, args) => args.includes('--binary') ? { status: 0, stdout: ++diffs === 1 ? '' : 'changed' } : null });
  const { report, exitCode } = f.review(verify);
  assert.equal(exitCode, 1);
  assert.equal(report.status, 'BLOCKED');
  assert.match(report.diagnostic, /archivos versionados/);
});

test('partial report remains complete JSON with BLOCKED, even if persistence fails', t => {
  const f = fixture(t);
  let last;
  let calls = 0;
  const result = f.review(verify, { persist: report => {
    if (++calls > 9) throw new Error('simulated partial write');
    last = JSON.stringify(report);
  } });
  assert.equal(JSON.parse(last).status, 'BLOCKED');
  assert.equal(result.report.status, 'BLOCKED');
  assert.equal(result.exitCode, 1);
});

test('actual JSON file outside worktree; invalid invocation installs nothing', t => {
  const f = fixture(t);
  const result = runReview(['--issue', 'invalid'], { repo: f.repo, temp: f.temp, run: () => assert.fail('spawn') });
  assert.ok(!result.reportPath.startsWith(f.root));
  if (existsSync(result.reportPath)) assert.equal(JSON.parse(readFileSync(result.reportPath)).status, 'BLOCKED');
  else {
    assert.equal(result.report.diagnostic, 'No se pudo guardar el reporte completo');
    assert.equal(JSON.parse(readFileSync(`${result.reportPath}.tmp`)).status, 'BLOCKED');
  }
  assert.equal(result.exitCode, 1);
});

test('process evidence captures an actual child exit (no network)', t => {
  const f = fixture(t);
  const result = f.review(verify, { run: (_binary, _args, options) => spawnSync(process.execPath, ['-e', 'process.exit(23)'], options) });
  assert.equal(result.report.processes[0].exitCode, 23);
  assert.equal(result.report.status, 'FAIL');
});


test('finds npm CLI in Windows MSI or portable Node layout without invoking a shell', t => {
  const temp = mkdtempSync(join(tmpdir(), 'npm-cli-layout-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const node = join(temp, 'node.exe');
  writeFileSync(node, '');
  const npm = join(temp, 'node_modules/npm/bin/npm-cli.js');
  mkdirSync(join(npm, '..'), { recursive: true });
  writeFileSync(npm, '');
  assert.equal(findNpmCli(node), npm);
});

test('finds npm CLI in Linux nvm layout', t => {
  const temp = mkdtempSync(join(tmpdir(), 'npm-cli-nvm-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const bin = join(temp, 'bin');
  mkdirSync(bin);
  const node = join(bin, 'node');
  writeFileSync(node, '');
  const npm = join(temp, 'lib/node_modules/npm/bin/npm-cli.js');
  mkdirSync(join(npm, '..'), { recursive: true });
  writeFileSync(npm, '');
  assert.equal(findNpmCli(node), npm);
});

test('untracked file with trailing whitespace fails verification without staging', t => {
  const f = fixture(t, { untracked: ['scripts/agents/verify-local-extra.mjs'] });
  const path = join(f.root, 'scripts/agents/verify-local-extra.mjs');
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, 'export const x = 1;  \n');
  const { report, exitCode } = f.review(verify);
  assert.equal(exitCode, 1);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.steps.find(step => step.name === 'diff').status, 'FAIL');
  assert.equal(report.steps.find(step => step.name === 'jest').status, 'NOT_RUN');
  assert.match(report.diagnostic, /Whitespace en archivo nuevo/);
  assert.ok(!f.calls.some(call => call.argv?.includes('add')));
});

test('reject changed path components that traverse or point through links', t => {
  const f = fixture(t);
  assert.throws(() => validateChangedPaths(f.root, ['docs/../package.json']), /Ruta modificada inválida/);
  assert.throws(() => validateChangedPaths(f.root, ['/outside']), /Ruta modificada inválida/);
  const link = join(f.root, 'app/api/src/purchases/linked.spec.ts');
  try { symlinkSync(join(f.api, 'src/purchases/a.spec.ts'), link, 'file'); }
  catch (e) { if (e.code === 'EPERM') { t.skip('Windows sin permisos para enlaces simbólicos'); return; } throw e; }
  assert.throws(() => validateChangedPaths(f.root, ['app/api/src/purchases/linked.spec.ts']), /rechazado/);
});

test('untracked whitespace helper accepts clean file and rejects extra blank line', t => {
  const f = fixture(t);
  const path = join(f.api, 'src/purchases/a.spec.ts');
  assert.equal(untrackedWhitespaceError(f.root, ['app/api/src/purchases/a.spec.ts']), null);
  writeFileSync(path, 'export {};\n\n');
  assert.match(untrackedWhitespaceError(f.root, ['app/api/src/purchases/a.spec.ts']), /líneas vacías/);
});


test('Git path aliases canonicalize to the same worktree; different worktrees remain rejected', () => {
  const long = join(tmpdir(), 'Auxiliar licitacion', 'zaping-agent-runs', 'issue-208');
  const short = join(tmpdir(), 'AUXILI~1', 'zaping-agent-runs', 'issue-208');
  const other = join(tmpdir(), 'other', 'issue-208');
  // Simulates Windows resolving an 8.3 name without relying on the host FS.
  const canonicalize = path => path === short ? long : path;
  assert.equal(samePhysicalPath(short, long, canonicalize), true);
  assert.equal(samePhysicalPath(short, other, canonicalize), false);
  assert.equal(samePhysicalPath(long, long, canonicalize), true);
});
