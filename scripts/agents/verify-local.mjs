#!/usr/bin/env node
/** Operator-invoked review aid. No approval, publishing, database or Codex actions. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, realpathSync, readFileSync, mkdtempSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, parse, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha = value => createHash('sha256').update(value).digest('hex');
const names = ['install', 'prisma', 'diff', 'jest', 'typecheck', 'lint'];
const deny = message => { throw new Error(message); };
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

// Git on Windows can record an 8.3 short path (AUXILI~1) while TEMP uses
// the long name. Compare physical identity, not lexical spelling. Only paths
// already derived from the trusted checkout or Git metadata reach this helper.
export function samePhysicalPath(a, b, canonicalize = realpathSync.native) {
  return same(canonicalize(resolve(a)), canonicalize(resolve(b)));
}

// Inspect every component, including existing parents: realpath alone hides links/junctions.
export function safePath(path, { stat = lstatSync, realpath = realpathSync } = {}) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    if (stat(current).isSymbolicLink()) deny('Symlink/junction rechazado');
  }
  const real = realpath(absolute);
  if (!same(real, absolute)) deny('La ruta real no coincide');
  return real;
}

export function parseArgs(args) {
  const usage = 'Uso: --issue N [--prepare | --verify --spec app/api/src/...spec.ts]';
  if (args[0] !== '--issue' || !/^[1-9]\d*$/.test(args[1] ?? '') || !Number.isSafeInteger(Number(args[1]))) deny(usage);
  if (args.length === 2) return { issue: args[1], mode: 'inspect' };
  if (args.length === 3 && args[2] === '--prepare') return { issue: args[1], mode: 'prepare' };
  if (args.length === 5 && args[2] === '--verify' && args[3] === '--spec') return { issue: args[1], mode: 'verify', spec: args[4] };
  deny(usage);
}

export function validateSpec(root, spec) {
  if (!/^app\/api\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.spec\.ts$/.test(spec ?? '')) deny('Ruta focal inválida');
  const path = safePath(join(root, spec));
  if (!lstatSync(path).isFile()) deny('Spec no es archivo regular');
  return relative(join(root, 'app/api'), path).split(sep).join('/');
}

// Conservatively reject all executable/config changes outside API source. Lifecycle
// hooks are rejected below, so source cannot be reached by an install hook.
export function preparationSafe(files) {
  return files.every(file => /^(app\/api\/src\/.*\.ts|docs\/.*\.md|scripts\/agents\/verify-local[^/]*\.mjs)$/.test(file)
    && !/(^|\/)(package(?:-lock)?\.json|npm-shrinkwrap\.json|\.npmrc)$/i.test(file));
}

// Validate *every* changed path before any npm/Prisma execution. Git names are
// repository-relative, but a file on disk may still point through a junction.
export function validateChangedPaths(root, files) {
  for (const file of files) {
    if (typeof file !== 'string' || file.startsWith('/') || file.includes('\\')
      || file.split('/').some(part => !part || part === '.' || part === '..')) deny('Ruta modificada inválida');
    const full = safePath(join(root, file));
    if (!lstatSync(full).isFile()) deny('Cambio no es archivo regular');
  }
}

// `git diff --check` does not inspect files Git still considers untracked.
// Check the equivalent whitespace hazards without staging or modifying them.
export function untrackedWhitespaceError(root, files) {
  for (const file of files) {
    validateChangedPaths(root, [file]);
    const content = readFileSync(join(root, file));
    if (content.includes(0)) return `${file}: contiene bytes NUL`;
    const lines = content.toString('utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (/[ \t]+$/.test(lines[i])) return `${file}:${i + 1}: espacios al final`;
    }
    if (/\r?\n\r?\n$/.test(content.toString('utf8'))) return `${file}: líneas vacías al final`;
  }
  return null;
}

// npm is installed in different locations by nvm, Node MSI and Linux
// distributions. Only accept a local JS CLI file, never resolve `npm` via shell.
export function findNpmCli(nodeExec = process.execPath) {
  const binDirs = [...new Set([dirname(nodeExec), dirname(realpathSync(nodeExec))])];
  for (const bin of binDirs) {
    for (const prefix of ['node_modules/npm/bin', '../lib/node_modules/npm/bin', '../node_modules/npm/bin']) {
      const candidate = resolve(bin, prefix, 'npm-cli.js');
      if (existsSync(candidate)) {
        const npm = safePath(candidate);
        if (lstatSync(npm).isFile()) return npm;
      }
    }
  }
  deny('No se encontró npm-cli.js junto a Node; revisar instalación de npm');
}

function cleanEnv(npmConfig) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|localappdata)$/i.test(key)) env[key] = value;
  }
  return {
    ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', CI: 'true', NO_COLOR: '1',
    // Do not inherit the operator's npm token-bearing user/global settings.
    ...(npmConfig ? {
      npm_config_userconfig: npmConfig.user,
      npm_config_globalconfig: npmConfig.global,
      npm_config_ignore_scripts: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
    } : {}),
  };
}

export function runReview(args, { repo = checkout, temp = tmpdir(), run = spawnSync, persist } = {}) {
  const started = Date.now();
  const report = { version: 1, status: 'BLOCKED', mode: null, base: null, head: null,
    branch: null, files: [], dependencies: false, steps: names.map(name => ({ name, status: 'NOT_RUN' })), processes: [] };
  let reportPath;
  let npmConfig;
  // Each checkpoint is a complete JSON document. A killed parent leaves BLOCKED,
  // never PASS; rename avoids readers observing a half-written JSON document.
  const save = () => {
    report.durationMs = Date.now() - started;
    if (persist) return persist(report);
    if (!reportPath) {
      safePath(temp);
      reportPath = join(mkdtempSync(join(temp, 'zaping-local-review-')), 'report.json');
    }
    writeFileSync(`${reportPath}.tmp`, JSON.stringify(report, null, 2), { mode: 0o600 });
    renameSync(`${reportPath}.tmp`, reportPath);
  };
  let root;
  const execute = (name, binary, argv, cwd) => {
    const step = { name, status: 'BLOCKED', command: binary, argv, cwd, exitCode: null, signal: null, durationMs: 0 };
    const gate = report.steps.findIndex(item => item.name === name);
    if (gate >= 0) report.steps[gate] = step;
    report.processes.push(step);
    save();
    const begin = Date.now();
    let result;
    try { result = run(binary, argv, { cwd, shell: false, encoding: 'utf8', env: cleanEnv(npmConfig), timeout: 1200000, maxBuffer: 16 * 1024 * 1024 }); }
    catch { result = { status: null, error: { code: 'SPAWN_FAILED' } }; }
    step.durationMs = Date.now() - begin;
    step.exitCode = Number.isInteger(result.status) ? result.status : null;
    step.signal = result.signal ?? null;
    step.errorCode = result.error?.code ?? null;
    // Do not persist raw process output: tests and npm may print secrets/data.
    for (const stream of ['stdout', 'stderr']) {
      const output = String(result[stream] ?? '');
      step[stream] = { bytes: Buffer.byteLength(output), sha256: sha(output) };
    }
    step.status = result.error || result.signal || step.exitCode === null ? 'BLOCKED' : step.exitCode === 0 ? 'PASS' : 'FAIL';
    save();
    if (step.status !== 'PASS') deny(`Proceso ${name}: ${step.status}; exit=${step.exitCode}; señal=${step.signal}; error=${step.errorCode}`);
    return String(result.stdout ?? '').trim();
  };
  const git = (argv, cwd = root) => execute('git-metadata', 'git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...argv], cwd);
  try {
    const options = parseArgs(args);
    report.mode = options.mode;
    save();
    root = safePath(join(temp, 'zaping-agent-runs', `issue-${options.issue}`));
    repo = safePath(repo);
    if (!lstatSync(safePath(join(root, '.git'))).isFile()) deny('Se requiere un worktree enlazado');
    const origin = git(['remote', 'get-url', 'origin'], repo);
    if (!/^(https:\/\/github\.com\/gclp96\/zaping(?:\.git)?|git@github\.com:gclp96\/zaping(?:\.git)?)$/.test(origin)) deny('Origin inesperado');
    const common = cwd => resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd));
    if (!samePhysicalPath(common(repo), common(root))) deny('Worktree de otro checkout');
    const registered = git(['worktree', 'list', '--porcelain', '-z'], repo).split('\0').filter(item => item.startsWith('worktree '));
    if (!registered.some(item => samePhysicalPath(item.slice(9), root))) deny('Worktree no registrado en el checkout');
    if (!samePhysicalPath(git(['rev-parse', '--show-toplevel']), root)) deny('Raíz de worktree inesperada');
    report.branch = git(['branch', '--show-current']);
    if (report.branch !== `codex/agent-issue-${options.issue}`) deny('Rama inesperada');
    report.head = git(['rev-parse', 'HEAD']);
    report.base = git(['merge-base', 'refs/remotes/origin/main', 'HEAD']);
    if (!/^[a-f0-9]{40}$/.test(report.head) || !/^[a-f0-9]{40}$/.test(report.base)) deny('SHA inválido');
    // No commits are authorized in agent worktrees. Prevent choosing a newer base
    // that conceals committed manifest changes.
    if (report.head !== report.base) deny('HEAD contiene commits fuera de la base; revisar manualmente');
    const split = output => output.split('\0').filter(Boolean);
    const untracked = split(git(['ls-files', '--others', '--exclude-standard', '-z']));
    report.files = [...new Set([
      ...split(git(['diff', '--no-ext-diff', '--name-only', '-z', report.base, '--'])),
      ...untracked,
      ...split(git(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'])).filter(file => !file.includes('node_modules/')),
    ])].sort();
    // Status records only filenames/status, never file contents.
    report.gitStatus = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const api = safePath(join(root, 'app/api'));
    report.dependencies = existsSync(join(api, 'node_modules'));
    save();
    if (options.mode === 'inspect') { report.status = 'NOT_RUN'; }
    else {
      if (!preparationSafe(report.files)) deny('Cambios en manifests/configuración/scripts o archivos no admitidos: revisar manualmente');
      validateChangedPaths(root, report.files);
      // No install lifecycle hooks, indirect scripts, or local dependency escapes.
      for (const path of ['package.json', 'app/api/package.json']) {
        safePath(join(root, path));
        let manifest;
        try { manifest = JSON.parse(readFileSync(join(root, path), 'utf8')); }
        catch { deny('Manifest ilegible o JSON inválido; revisar manualmente'); }
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) deny('Manifest inválido');
        if (Object.keys(manifest.scripts ?? {}).some(key => /^(preinstall|install|postinstall|prepare|prepublish|preprepare|postprepare)$/.test(key))) deny('Lifecycle de instalación requiere revisión separada');
        for (const value of Object.values({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies })) {
          if (/^(file:|link:|workspace:|\.\.?[\\/]|[\\/])/.test(value)) deny('Dependencia local rechazada');
        }
      }
      const npm = findNpmCli();
      // Files with empty contents, created outside the worktree, override any
      // user/global npmrc. npm never receives inherited npm credentials.
      const configDir = mkdtempSync(join(temp, 'zaping-npm-config-'));
      npmConfig = { user: join(configDir, 'user.npmrc'), global: join(configDir, 'global.npmrc') };
      writeFileSync(npmConfig.user, '', { mode: 0o600, flag: 'wx' });
      writeFileSync(npmConfig.global, '', { mode: 0o600, flag: 'wx' });
      const trackedBefore = git(['diff', '--no-ext-diff', '--binary', report.base, '--']);
      const originalHead = report.head;
      if (options.mode === 'prepare') {
        execute('install', process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], api);
        const prisma = safePath(join(api, 'node_modules/prisma/build/index.js'));
        execute('prisma', process.execPath, [prisma, 'generate'], api);
      } else {
        const spec = validateSpec(root, options.spec);
        for (const path of ['jest/bin/jest.js', 'typescript/bin/tsc', 'eslint/bin/eslint.js', '.prisma/client/index.js']) safePath(join(api, 'node_modules', path));
        execute('diff', 'git', ['--no-optional-locks', 'diff', '--no-ext-diff', '--check', report.base, '--'], root);
        const untrackedError = untrackedWhitespaceError(root, untracked);
        if (untrackedError) {
          report.steps.find(step => step.name === 'diff').status = 'FAIL';
          deny(`Whitespace en archivo nuevo: ${untrackedError}`);
        }
        execute('jest', process.execPath, [npm, 'test', '--', '--runInBand', '--runTestsByPath', spec], api);
        execute('typecheck', process.execPath, [npm, 'run', 'typecheck'], api);
        execute('lint', process.execPath, [npm, 'run', 'lint:check'], api);
      }
      if (git(['rev-parse', 'HEAD']) !== originalHead || git(['diff', '--no-ext-diff', '--binary', report.base, '--']) !== trackedBefore) deny('Los procesos cambiaron HEAD o archivos versionados; conservar y revisar');
      report.status = 'PASS';
    }
  } catch (error) {
    report.status = report.processes.some(step => step.status === 'FAIL') ? 'FAIL' : 'BLOCKED';
    // Messages are ours or filesystem codes only, never arbitrary process output.
    report.diagnostic = error.code ? `Filesystem: ${error.code}` : error.message;
  }
  try { save(); } catch { report.status = 'BLOCKED'; report.diagnostic = 'No se pudo guardar el reporte completo'; }
  return { report, reportPath, exitCode: ['PASS', 'NOT_RUN'].includes(report.status) ? 0 : 1 };
}

if (process.argv[1] && same(resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  const { report, reportPath, exitCode } = runReview(process.argv.slice(2));
  console.log(`${report.status} | modo=${report.mode ?? 'inválido'} | base=${report.base} | HEAD=${report.head}`);
  console.log(`Rama: ${report.branch}; dependencias presentes: ${report.dependencies}; archivos: ${JSON.stringify(report.files)}`);
  for (const step of report.steps) console.log(`${step.name}: ${step.status}${step.exitCode !== undefined ? ` (exit=${step.exitCode}, ${step.durationMs} ms)` : ''}`);
  if (report.diagnostic) console.error(report.diagnostic);
  console.log(`Reporte: ${reportPath ?? 'NO GUARDADO'} | duración=${report.durationMs} ms`);
  process.exitCode = exitCode;
}
