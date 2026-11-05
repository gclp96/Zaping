#!/usr/bin/env node
/** Deterministic, operator-invoked evidence collector. Never executes proposal code. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, openSync, closeSync, fstatSync, readFileSync, readSync, mkdtempSync, writeFileSync, renameSync, rmSync, chmodSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, parse, sep, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIssue } from './issue-contract.mjs';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = 'gclp96/zaping';
const ALLOWED = new Set(['scripts/agents/qa-bundle.mjs', 'scripts/agents/qa-bundle.test.mjs', 'docs/engineering/QA_BUNDLE_V1.md']);
const LIMITS = Object.freeze({ fileBytes: 256 * 1024, totalBytes: 1024 * 1024, paths: 1000, processBytes: 8 * 1024 * 1024 });
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = () => { throw new Error('BLOCKED'); };
const json = value => JSON.stringify(value);
const inside = (parent, child) => { const path = relative(parent, child); return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)); };
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

export function parseArgs(args) {
  if (args.length !== 4 || args[0] !== '--issue' || !/^[1-9]\d*$/.test(args[1])
    || !Number.isSafeInteger(Number(args[1])) || args[2] !== '--approval-sha' || !/^[a-f0-9]{64}$/.test(args[3])) fail();
  return { number: Number(args[1]), approval: args[3] };
}

export function validatePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes(':') || /[\x00-\x1f\x7f]/.test(path)
    || path.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) fail();
  if (secret(path)) fail();
  return path;
}

function physical(path, missing = false) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) fail(); }
    catch (error) {
      if (missing && error.code === 'ENOENT') return null;
      throw error;
    }
  }
  const real = realpathSync.native(absolute);
  if (!same(real, absolute)) fail();
  return real;
}

export function parseStatus(raw) {
  const tokens = raw.split('\0');
  if (tokens.pop() !== '') fail();
  const records = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!/^[ MADRCU?!T]{2} /.test(token)) fail();
    const status = token.slice(0, 2);
    const path = validatePath(token.slice(3));
    const entry = { path, status };
    if (/[RC]/.test(status)) entry.originalPath = validatePath(tokens[++i]);
    if (status.includes('U') || status === 'AA' || status === 'DD') fail();
    records.push(entry);
  }
  return records.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function secret(text) {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,}|AKIA[A-Z0-9]{16}|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:password|secret|token|api[_-]?key)\s*[=:]\s*["']?[^\s"';,]{8,}|[a-z]{1,16}:\/\/[^\s/:]+:[^\s/@]+@/i.test(text);
}

function readEntry(root, entry, number) {
  const path = join(root, entry.path);
  // Validate parents even for deleted files. Never open a deleted path.
  physical(dirname(path), entry.status.includes('D'));
  let stat;
  try { stat = lstatSync(path, { bigint: true }); }
  catch (error) {
    if (error.code !== 'ENOENT' || !entry.status.includes('D')) fail();
    return { ...entry, size: null, sha256: null, excluded: 'DELETED' };
  }
  physical(path);
  if (!stat.isFile() || stat.nlink !== 1n) fail();
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  let content;
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (opened.dev !== stat.dev || opened.ino !== stat.ino || !opened.isFile()) fail();
    // Bound memory while hashing even files excluded for size/scope.
    const digest = createHash('sha256');
    const chunks = [];
    let size = 0;
    const buffer = Buffer.alloc(65536);
    for (;;) {
      const bytes = readFileSyncChunk(fd, buffer);
      if (!bytes) break;
      size += bytes;
      if (size > 64 * 1024 * 1024) fail();
      digest.update(buffer.subarray(0, bytes));
      if (size <= LIMITS.fileBytes) chunks.push(Buffer.from(buffer.subarray(0, bytes)));
    }
    const after = fstatSync(fd, { bigint: true });
    if (stat.size !== BigInt(size) || stat.mtimeNs !== after.mtimeNs || stat.ctimeNs !== after.ctimeNs) fail();
    content = size <= LIMITS.fileBytes ? Buffer.concat(chunks) : null;
    const result = { ...entry, size, sha256: digest.digest('hex'), identity: [String(stat.dev), String(stat.ino), String(stat.mtimeNs), String(stat.ctimeNs)] };
    if (number !== 226 || !ALLOWED.has(entry.path) || (entry.originalPath && !ALLOWED.has(entry.originalPath))) result.excluded = 'OUT_OF_SCOPE';
    else if (!content) result.excluded = 'TOO_LARGE';
    else {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(content); } catch { result.excluded = 'BINARY'; }
      if (content.includes(0) || /[\x01-\x08\x0b\x0c\x0e-\x1f]/.test(text ?? '')) result.excluded = 'BINARY';
      if (!result.excluded && secret(text)) result.excluded = 'POSSIBLE_SECRET';
      if (!result.excluded) result.content = text;
    }
    return result;
  } finally { closeSync(fd); }
}
const readFileSyncChunk = (fd, buffer) => readSync(fd, buffer, 0, buffer.length, null);

export function collect(args, testOptions) {
  // No environment variable/CLI switch can enable executor or path injection.
  if (testOptions && !process.env.NODE_TEST_CONTEXT) fail();
  const { repo = checkout, temp = tmpdir(), run = spawnSync, checkpoint = () => {}, persist = writeFileSync } = testOptions ?? {};
  let output;
  try {
    const { number, approval } = parseArgs(args);
    // Node does not expose a complete Windows reparse-tag/handle identity check.
    // Fail closed until a separately reviewed native implementation is available.
    if (process.platform === 'win32') fail();
    const root = physical(join(temp, 'zaping-agent-runs', `issue-${number}`));
    const trusted = physical(repo);
    // An implementation inside a proposal worktree is untrusted code. The
    // collector must run from a distinct, checked-out main repository.
    if (same(root, trusted) || !lstatSync(join(trusted, '.git')).isDirectory()) fail();
    if (!lstatSync(join(root, '.git')).isFile()) fail();
    const execute = (binary, argv, cwd = root) => {
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|SYSTEMROOT|TEMP|TMP|USERPROFILE|LOCALAPPDATA|GH_TOKEN|GITHUB_TOKEN|GH_CONFIG_DIR)$/i.test(key)));
      Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GH_PROMPT_DISABLED: '1' });
      const result = run(binary, argv, { cwd, shell: false, encoding: 'buffer', env, timeout: 30000, maxBuffer: LIMITS.processBytes });
      // Git can skip unreadable directories and still exit 0. Any diagnostic
      // means the resulting inventory may be incomplete; fail closed.
      if (result.error || result.signal || result.status !== 0 || (result.stderr && result.stderr.length > 0)) fail();
      const bytes = Buffer.from(result.stdout ?? '');
      try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(); }
    };
    const git = (argv, cwd) => execute('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...argv], cwd);
    const issue = JSON.parse(execute('gh', ['issue', 'view', String(number), '--repo', REPO, '--json', 'number,title,body,labels,state,url'], repo));
    if (issue.number !== number || issue.url !== `https://github.com/${REPO}/issues/${number}` || !validateIssue(issue).ok
      || hash(json([issue.number, issue.title, issue.body])) !== approval) fail();
    const identity = () => {
      // Even read-only diff/status may invoke clean filters. Configuration is
      // data, not authority: reject filters before inspecting proposal files.
      for (const cwd of [repo, root]) {
        const keys = git(['config', '--list', '--name-only', '-z'], cwd).split('\0');
        if (keys.some(key => /^filter\./i.test(key))) fail();
      }
      for (const cwd of [repo, root]) {
        if (!/^(https:\/\/github\.com\/gclp96\/zaping(?:\.git)?|git@github\.com:gclp96\/zaping(?:\.git)?)$/.test(git(['remote', 'get-url', 'origin'], cwd).trim())) fail();
      }
      // Never trust a dirty checkout or a worktree on the proposed branch as
      // the operator's source of security-sensitive policy and executable code.
      if (!same(physical(git(['rev-parse', '--show-toplevel'], repo).trim()), trusted)
        || git(['branch', '--show-current'], repo).trim() !== 'main'
        || git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], repo) !== '') fail();
      const common = cwd => physical(resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd).trim()));
      if (common(repo) !== common(root)) fail();
      const registered = git(['worktree', 'list', '--porcelain', '-z'], repo).split('\0').filter(x => x.startsWith('worktree '));
      if (!registered.some(x => physical(x.slice(9)) === root) || physical(git(['rev-parse', '--show-toplevel']).trim()) !== root) fail();
      const branch = git(['branch', '--show-current']).trim();
      const headSha = git(['rev-parse', 'HEAD']).trim();
      const baseSha = git(['merge-base', 'refs/remotes/origin/main', 'HEAD']).trim();
      const trustedHead = git(['rev-parse', 'HEAD'], repo).trim();
      const trustedOrigin = git(['rev-parse', 'refs/remotes/origin/main'], repo).trim();
      if (branch !== `codex/agent-issue-${number}` || !/^[a-f0-9]{40}$/.test(baseSha)
        || headSha !== baseSha || trustedHead !== headSha || trustedOrigin !== headSha) fail();
      return { branch, baseSha, headSha, worktreeId: hash(root + '\0' + common(root)) };
    };
    const capture = () => {
      const id = identity();
      // Validate indexed paths before status/diff touches working-file content.
      for (const record of git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean)) {
        const match = /^(\d{6}) ([a-f0-9]{40}) ([0-3])\t([\s\S]+)$/.exec(record);
        if (!match || match[3] !== '0' || !['100644', '100755'].includes(match[1])) fail();
        validatePath(match[4]);
        physical(join(root, match[4]), true);
      }
      const status = git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all']);
      const entries = parseStatus(status);
      if (entries.length > LIMITS.paths) fail();
      // ls-files without exclude-standard also covers ignored untracked files:
      // a proposal's .gitignore must never hide evidence from this collector.
      const others = git(['ls-files', '--others', '-z']).split('\0');
      if (others.pop() !== '' || others.length > LIMITS.paths) fail();
      for (const path of others) {
        validatePath(path);
        if (!entries.some(entry => entry.path === path)) entries.push({ path, status: '??' });
      }
      entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      // Git status can conceal assume-unchanged/skip-worktree entries. Refuse
      // these index states instead of treating their absence as clean evidence.
      for (const record of git(['ls-files', '-v', '-z']).split('\0').filter(Boolean)) {
        if (/^[a-zS]/.test(record)) fail();
      }
      if (entries.length > LIMITS.paths) fail();
      const inventory = entries.map(entry => {
        if (entry.originalPath) {
          physical(join(root, entry.originalPath), true);
        }
        return readEntry(root, entry, number);
      });
      // Hash both layers: staged changes reverted on disk must remain visible.
      const diffSha256 = hash(json([
        git(['diff', '--no-ext-diff', '--no-textconv', '--binary', '--no-renames', '--', '.']),
        git(['diff', '--cached', '--no-ext-diff', '--no-textconv', '--binary', '--no-renames', '--', '.']),
      ]));
      return { ...id, diffSha256, inventory };
    };
    const before = capture();
    checkpoint('captured');
    const snapshot = before.inventory.filter(x => 'content' in x).map(x => ({ path: x.path, content: x.content }));
    const snapshotBytes = json(snapshot);
    if (Buffer.byteLength(snapshotBytes) > LIMITS.totalBytes) fail();
    const fingerprint = hash(json(before));
    if (hash(json(capture())) !== fingerprint) fail();
    physical(temp);
    if (inside(root, temp) || inside(repo, temp)) fail();
    output = mkdtempSync(join(temp, 'zaping-qa-bundle-'));
    chmodSync(output, 0o700);
    persist(join(output, 'snapshot.json'), snapshotBytes, { mode: 0o600, flag: 'wx' });
    if (hash(readFileSync(join(output, 'snapshot.json'))) !== hash(snapshotBytes)) fail();
    checkpoint('persisted');
    if (hash(json(capture())) !== fingerprint) fail();
    const inventory = before.inventory.map(({ content, identity: fileIdentity, ...entry }) => ({
      ...entry,
      evidenceGaps: [
        ...(/[AMRC]/.test(entry.status[0]) ? ['INDEX_CONTENT_HASH_ONLY'] : []),
        ...(entry.excluded === 'DELETED' || entry.status.includes('D') ? ['BASE_CONTENT_UNAVAILABLE'] : []),
      ],
    }));
    const manifest = { schemaVersion: 1, issueNumber: number, approvedIssueSha256: approval,
      ...before, inventory, snapshotSha256: hash(snapshotBytes), fingerprintSha256: fingerprint,
      status: inventory.some(x => x.excluded || x.status.includes('D') || /[AMRC]/.test(x.status[0])) ? 'INSUFFICIENT_EVIDENCE' : 'QA_REVIEW',
      limits: LIMITS, checks: [{ name: 'verify-local', status: 'NOT_RUN', binding: 'UNVERIFIED' }],
      limitations: ['Human review required before model delivery; secret detection is heuristic.', 'Only current working-file text is exported; base/index contents and raw diffs are hash-only. Staged additions/modifications/renames require supplementary human evidence.', 'No test result is cryptographically bound to this snapshot.', 'No QA approval, merge or deploy authority.', 'Read-only commands are not an OS sandbox; concurrent hostile writers require external isolation.'] };
    persist(join(output, 'manifest.tmp'), json(manifest), { mode: 0o600, flag: 'wx' });
    if (readFileSync(join(output, 'manifest.tmp'), 'utf8') !== json(manifest) || hash(json(capture())) !== fingerprint) fail();
    renameSync(join(output, 'manifest.tmp'), join(output, 'manifest.json'));
    return { status: manifest.status, output, manifest, exitCode: manifest.status === 'QA_REVIEW' ? 0 : 1 };
  } catch {
    if (output) { try { rmSync(output, { recursive: true, force: true }); } catch { /* No completed manifest is advertised. */ } }
    return { status: 'BLOCKED', exitCode: 1 };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = collect(process.argv.slice(2));
  console.log(result.status);
  if (result.output) console.log(`Evidence (human review required): ${result.output}`);
  process.exitCode = result.exitCode;
}
