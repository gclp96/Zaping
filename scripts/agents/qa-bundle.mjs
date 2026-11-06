#!/usr/bin/env node
/** Deterministic, operator-invoked evidence collector. Never executes proposal code. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, openSync, closeSync, fstatSync, readFileSync, readSync, mkdtempSync, writeFileSync, renameSync, rmSync, chmodSync, constants } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { resolve, dirname, join, parse, sep, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIssue } from './issue-contract.mjs';
import { validateQaEnvelope } from './qa-contract.mjs';
import { loadIssueContext } from './issue-context.mjs';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = 'gclp96/zaping';
const ALLOWED = new Set(['scripts/agents/qa-bundle.mjs', 'scripts/agents/qa-bundle.test.mjs', 'docs/engineering/QA_BUNDLE_V1.md']);
const LIMITS = Object.freeze({ fileBytes: 256 * 1024, totalBytes: 1024 * 1024, paths: 1000, processBytes: 8 * 1024 * 1024 });
const V2_LIMITS = Object.freeze({ ...LIMITS, tableEntries: 50000, commands: 30000, commandBytes: 64 * 1024 * 1024, durationMs: 120000 });
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = () => { throw new Error('BLOCKED'); };
const json = value => JSON.stringify(value);
const inside = (parent, child) => { const path = relative(parent, child); return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)); };
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

export function parseArgs(args) {
  if (args[0] !== '--version' || !['1', '2'].includes(args[1])) fail();
  const version = Number(args[1]);
  args = args.slice(2);
  let scopeSha;
  if (version === 2) {
    if (args.length !== 6 || args[4] !== '--scope-sha' || !/^[a-f0-9]{64}$/.test(args[5])) fail();
    scopeSha = args[5];
    args = args.slice(0, 4);
  }
  if (args.length !== 4 || args[0] !== '--issue' || !/^[1-9]\d*$/.test(args[1])
    || !Number.isSafeInteger(Number(args[1])) || args[2] !== '--approval-sha' || !/^[a-f0-9]{64}$/.test(args[3])) fail();
  return { version, number: Number(args[1]), approval: args[3], scopeSha };
}

export function validatePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes(':') || /[\x00-\x1f\x7f]/.test(path)
    || path.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) fail();
  if (secret(path) || path.length > 240 || path !== path.normalize('NFC') || /[\p{Cf}\p{Cs}\p{Cc}]/u.test(path) || /[*?"<>|%{}\[\]]/.test(path)) fail();
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
    if (json(statIdentity(opened)) !== json(statIdentity(stat)) || !opened.isFile()) fail();
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
    if (stat.size !== BigInt(size) || json(statIdentity(stat)) !== json(statIdentity(after)) || json(statIdentity(stat)) !== json(statIdentity(lstatSync(path, { bigint: true })))) fail();
    content = size <= LIMITS.fileBytes ? Buffer.concat(chunks) : null;
    // Keep the V1 fingerprint preimage compatible with QA-BUNDLE-01 (#226):
    // dev, ino, mtimeNs, ctimeNs. V2 retains the extended nine-field identity.
    const identity = number === null ? statIdentity(stat) :
      ['dev', 'ino', 'mtimeNs', 'ctimeNs'].map(key => String(stat[key]));
    const result = { ...entry, size, sha256: digest.digest('hex'), identity };
    if (number !== null && (number !== 226 || !ALLOWED.has(entry.path) || (entry.originalPath && !ALLOWED.has(entry.originalPath)))) result.excluded = 'OUT_OF_SCOPE';
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

// Test identities are accepted only by collect's guarded test API, never CLI/env.
function readPolicy(number, expected, approval, trusted, tasks, testIdentity) {
  const identity = testIdentity ?? userInfo();
  const uid = process.getuid();
  if (uid !== process.geteuid() || identity.uid !== uid || !isAbsolute(identity.homedir)) fail();
  const home = resolve(identity.homedir);
  const path = join(home, '.local/state/zaping-agent-runner/approved-scopes', `issue-${number}.json`);
  if (inside(trusted, path) || inside(tasks, path)) fail();
  const inspect = () => {
    physical(path);
    let current = testIdentity ? home : parse(path).root;
    const stats = [];
    const parts = path.slice(current.length).split(sep).filter(Boolean);
    for (const part of ['', ...parts]) {
      if (part) current = join(current, part);
      const st = lstatSync(current, { bigint: true });
      const leaf = current === path;
      if ((st.uid !== BigInt(uid) && st.uid !== 0n) || (st.mode & 0o7022n) !== 0n) fail();
      if (inside(home, current) && (st.uid !== BigInt(uid) || (st.mode & 0o777n) !== (leaf ? 0o600n : 0o700n))) fail();
      if (leaf ? !st.isFile() || st.nlink !== 1n || st.size > 65536n : !st.isDirectory()) fail();
      stats.push(statIdentity(st));
    }
    return stats;
  };
  const before = inspect();
  const st = lstatSync(path, { bigint: true });
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let bytes;
  try {
    if (json(statIdentity(fstatSync(fd, { bigint: true }))) !== json(statIdentity(st))) fail();
    const buffer = Buffer.alloc(65537);
    let size = 0;
    while (size < buffer.length) {
      const n = readSync(fd, buffer, size, buffer.length - size, null);
      if (!n) break;
      size += n;
    }
    if (size > 65536 || BigInt(size) !== st.size) fail();
    bytes = buffer.subarray(0, size);
    if (json(statIdentity(fstatSync(fd, { bigint: true }))) !== json(statIdentity(st))) fail();
  } finally { closeSync(fd); }
  if (json(inspect()) !== json(before) || hash(bytes) !== expected || bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))) fail();
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  // The schema is flat with string arrays. Count every decoded member name;
  // reject nested objects and duplicate/escaped duplicate names before parsing.
  const keys = [...text.matchAll(/("(?:[^"\\]|\\.)*")\s*:/g)].map(m => JSON.parse(m[1]));
  const required = ['authority', 'operatorId', 'issueNumber', 'approvedIssueSha256', 'allowedPaths', 'forbiddenPaths'];
  if (keys.length !== required.length || new Set(keys).size !== keys.length || keys.some(k => !required.includes(k))) fail();
  const scope = JSON.parse(text);
  if (scope.issueNumber !== number || scope.approvedIssueSha256 !== approval) fail();
  // Validate the exact closed policy through the existing envelope contract.
  const probe = { schemaVersion: 1, repository: REPO, issueNumber: number, approvedIssueSha256: approval,
    branch: `codex/agent-issue-${number}`, baseSha: 'a'.repeat(40), headSha: 'a'.repeat(40), worktreeId: expected,
    diffSha256: expected, snapshotSha256: expected, fingerprintSha256: expected, scope, inventory: [], limitations: [] };
  if (validateQaEnvelope(probe).status === 'BLOCKED') fail();
  return { scope, digest: hash(bytes), identity: before };
}
function statIdentity(st) {
  return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode', 'uid', 'gid', 'nlink'].map(k => String(st[k]));
}
function safeLayer(bytes, mode) {
  const result = { mode, size: bytes.length, sha256: hash(bytes) };
  if (bytes.length > LIMITS.fileBytes) return { reason: 'TOO_LARGE' };
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return { reason: 'BINARY' }; }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return { reason: 'BINARY' };
  if (secret(text)) return { reason: 'POSSIBLE_SECRET' };
  return { ...result, content: text };
}
function captureTable(raw, pattern) {
  const records = raw.split('\0');
  if (records.pop() !== '' || records.length > V2_LIMITS.tableEntries) fail();
  const table = new Map();
  for (const record of records) {
    const m = pattern.exec(record);
    if (!m || !['100644', '100755'].includes(m[1])) fail();
    const path = validatePath(m[3]);
    if (table.has(path)) fail();
    table.set(path, { mode: m[1], oid: m[2] });
  }
  return table;
}
function captureLayers(root, entry, git, baseTable, indexTable) {
  const blob = meta => {
    if (!meta) return null;
    const sizeText = git(['cat-file', '-s', meta.oid]).trim();
    if (!/^(0|[1-9]\d*)$/.test(sizeText)) fail();
    const size = Number(sizeText);
    if (size > LIMITS.fileBytes) return { reason: 'TOO_LARGE' };
    const bytes = git(['cat-file', 'blob', meta.oid], undefined, true);
    if (bytes.length !== size) fail();
    return safeLayer(bytes, meta.mode);
  };
  let base = blob(baseTable.get(entry.originalPath ?? entry.path));
  let index = blob(indexTable.get(entry.path));
  if (entry.status === '??' && (base || index) || entry.status[0] === 'A' && base) fail();
  let working = null;
  let current = { size: null, sha256: null };
  if (!entry.status.includes('D')) {
    current = readEntry(root, entry, null);
    const st = lstatSync(join(root, entry.path), { bigint: true });
    const mode = (st.mode & 0o111n) ? '100755' : '100644';
    working = current.excluded ? { reason: current.excluded } : { mode, size: current.size, sha256: current.sha256, content: current.content };
    if (entry.status[1] === ' ' && index && !index.reason && working && !working.reason
      && (index.sha256 !== working.sha256 || index.mode !== working.mode)) fail();
  } else physical(dirname(join(root, entry.path)), true);
  const reasons = [...new Set([base, index, working].map(l => l?.reason).filter(Boolean))];
  if (reasons.length) base = index = working = null;
  const gaps = [...reasons];
  if (entry.status !== '??' && entry.status[0] !== 'A' && !base) gaps.push('BASE_CONTENT_UNAVAILABLE');
  if (entry.status !== '??' && entry.status[0] !== ' ' && !index) gaps.push('INDEX_CONTENT_UNAVAILABLE');
  return { ...entry, size: current.size, sha256: current.sha256, identity: current.identity ?? null,
    working, base, index, excluded: reasons[0] ?? null, evidenceGaps: [...new Set(gaps)] };
}

export function collect(args, testOptions) {
  // No environment variable/CLI switch can enable executor or path injection.
  if (testOptions && !process.env.NODE_TEST_CONTEXT) fail();
  const { repo = checkout, temp = tmpdir(), run = spawnSync, checkpoint = () => {}, persist = writeFileSync } = testOptions ?? {};
  let output;
  try {
    const { version, number, approval, scopeSha } = parseArgs(args);
    if (version === 1 && number !== 226) fail();
    // Node does not expose a complete Windows reparse-tag/handle identity check.
    // Fail closed until a separately reviewed native implementation is available.
    if (process.platform === 'win32') fail();
    const root = physical(join(temp, 'zaping-agent-runs', `issue-${number}`));
    const trusted = physical(repo);
    // An implementation inside a proposal worktree is untrusted code. The
    // collector must run from a distinct, checked-out main repository.
    if (same(root, trusted) || !lstatSync(join(trusted, '.git')).isDirectory()) fail();
    if (!lstatSync(join(root, '.git')).isFile()) fail();
    const started = performance.now();
    let commandCount = 0, commandBytes = 0;
    const execute = (binary, argv, cwd = root, raw = false) => {
      if (version === 2 && (++commandCount > V2_LIMITS.commands || performance.now() - started > V2_LIMITS.durationMs)) fail();
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|SYSTEMROOT|TEMP|TMP|USERPROFILE|LOCALAPPDATA|GH_TOKEN|GITHUB_TOKEN|GH_CONFIG_DIR)$/i.test(key)));
      Object.assign(env, { GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GH_PROMPT_DISABLED: '1' });
      const result = run(binary, argv, { cwd, shell: false, encoding: 'buffer', env, timeout: 30000, maxBuffer: LIMITS.processBytes });
      // Git can skip unreadable directories and still exit 0. Any diagnostic
      // means the resulting inventory may be incomplete; fail closed.
      if (result.error || result.signal || result.status !== 0 || (result.stderr && result.stderr.length > 0)) fail();
      const bytes = Buffer.from(result.stdout ?? '');
      commandBytes += bytes.length;
      if (bytes.length > LIMITS.processBytes || (version === 2 && (commandBytes > V2_LIMITS.commandBytes || performance.now() - started > V2_LIMITS.durationMs))) fail();
      if (raw) return bytes;
      try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(); }
    };
    const git = (argv, cwd, raw = false) => execute('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...argv], cwd, raw);
    const legacyIssue = () => JSON.parse(execute('gh', ['issue', 'view', String(number), '--repo', REPO, '--json', 'number,title,body,labels,state,url'], repo));
    const context = () => {
      const value = loadIssueContext(number, (binary, argv, opts) => ({ status: 0, stdout: execute(binary, argv, opts.cwd) }), repo);
      if (!validateIssue(value.issue).ok || value.issue.state !== 'OPEN' || value.approvalSha !== approval) fail();
      return value;
    };
    const initialContext = version === 2 ? context() : null;
    const issue = initialContext?.issue ?? legacyIssue();
    if (issue.number !== number || issue.url !== `https://github.com/${REPO}/issues/${number}` || !validateIssue(issue).ok
      || (version === 1 && hash(json([issue.number, issue.title, issue.body])) !== approval)) fail();
    const policy = version === 2 ? () => readPolicy(number, scopeSha, approval, trusted, join(temp, 'zaping-agent-runs'), testOptions?.osIdentity) : null;
    const initialPolicy = policy?.();
    const identity = () => {
      if (version === 2 && (json(context()) !== json(initialContext) || json(policy()) !== json(initialPolicy))) fail();
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
        || git(['status', '--porcelain=v1', '-z', '--untracked-files=all', ...(version === 2 ? ['--ignored'] : [])], repo) !== '') fail();
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
      const indexRaw = git(['ls-files', '--stage', '-z']);
      const indexTable = version === 2 ? captureTable(indexRaw, /^(\d{6}) ([a-f0-9]{40}) 0\t([\s\S]+)$/) : null;
      const baseTable = version === 2 ? captureTable(git(['ls-tree', '-r', '-z', id.baseSha]), /^(\d{6}) blob ([a-f0-9]{40})\t([\s\S]+)$/) : null;
      for (const record of indexRaw.split('\0').filter(Boolean)) {
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
      if (version === 2) {
        for (const entry of entries) for (const path of [entry.path, entry.originalPath].filter(Boolean)) {
          if (!initialPolicy.scope.allowedPaths.includes(path) || initialPolicy.scope.forbiddenPaths.includes(path)) fail();
        }
      }
      const inventory = entries.map(entry => {
        if (entry.originalPath) {
          physical(join(root, entry.originalPath), true);
        }
        if (version === 1) return readEntry(root, entry, number);
        return captureLayers(root, entry, git, baseTable, indexTable);
      });
      // Hash both layers: staged changes reverted on disk must remain visible.
      const diffSha256 = hash(json([
        git(['diff', '--no-ext-diff', '--no-textconv', '--binary', '--no-renames', '--', '.']),
        git(['diff', '--cached', '--no-ext-diff', '--no-textconv', '--binary', '--no-renames', '--', '.']),
      ]));
      return { ...id, ...(version === 2 ? { repository: REPO, issueNumber: number, approvedIssueSha256: approval, scopeSha256: initialPolicy.digest } : {}), diffSha256, inventory };
    };
    const before = capture();
    checkpoint('captured');
    const snapshot = version === 2 ? { schemaVersion: 2, files: before.inventory.map(({ path, originalPath, working, base, index }) => ({ path, ...(originalPath ? { originalPath } : {}), working, base, index })) } : before.inventory.filter(x => 'content' in x).map(x => ({ path: x.path, content: x.content }));
    const snapshotBytes = json(snapshot);
    if (Buffer.byteLength(snapshotBytes) > LIMITS.totalBytes) fail();
    // V2 capture binds Git identity, approved context and exact policy-byte digest.
    // Keep scopeSha256 outside the closed V1 envelope.
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
    let manifest = { schemaVersion: 1, issueNumber: number, approvedIssueSha256: approval,
      ...before, inventory, snapshotSha256: hash(snapshotBytes), fingerprintSha256: fingerprint,
      status: inventory.some(x => x.excluded || x.status.includes('D') || /[AMRC]/.test(x.status[0])) ? 'INSUFFICIENT_EVIDENCE' : 'QA_REVIEW',
      limits: LIMITS, checks: [{ name: 'verify-local', status: 'NOT_RUN', source: { kind: 'NOT_RUN', id: 'not-run' }, binding: 'UNVERIFIED' }],
      limitations: ['Human review required before model delivery; secret detection is heuristic.', 'Only current working-file text is exported; base/index contents and raw diffs are hash-only. Staged additions/modifications/renames require supplementary human evidence.', 'No test result is cryptographically bound to this snapshot.', 'No QA approval, merge or deploy authority.', 'Read-only commands are not an OS sandbox; concurrent hostile writers require external isolation.'] };
    if (version === 2) {
      const metadata = layer => layer === null ? null : { size: layer.size, sha256: layer.sha256 };
      const envelope = {
        schemaVersion: 1, repository: REPO, issueNumber: number, approvedIssueSha256: approval,
        branch: before.branch, baseSha: before.baseSha, headSha: before.headSha, worktreeId: before.worktreeId,
        scope: initialPolicy.scope,
        inventory: before.inventory.map(e => ({ path: e.path, ...(e.originalPath ? { originalPath: e.originalPath } : {}),
          status: e.status, kind: 'REGULAR', size: e.size, sha256: e.sha256,
          base: metadata(e.base), index: metadata(e.index), excluded: e.excluded, evidenceGaps: e.evidenceGaps })),
        diffSha256: before.diffSha256, snapshotSha256: hash(snapshotBytes), fingerprintSha256: fingerprint,
        checks: [{ name: 'verify-local', status: 'NOT_RUN', source: { kind: 'NOT_RUN', id: 'not-run' }, binding: 'UNVERIFIED' }],
        limitations: ['Human review required; secret detection is heuristic.', 'Checks are not attested.', 'Concurrent writers require external isolation.'],
      };
      const result = validateQaEnvelope(envelope);
      if (result.status === 'BLOCKED') fail();
      manifest = { schemaVersion: 2, scopeSha256: initialPolicy.digest, envelope: result.envelope, result: { status: result.status, reasons: result.reasons, exportablePaths: result.exportablePaths },
        metadata: before.inventory.map(({ working, base, index, ...e }) => e), limits: V2_LIMITS };
    }
    persist(join(output, 'manifest.tmp'), json(manifest), { mode: 0o600, flag: 'wx' });
    if (readFileSync(join(output, 'manifest.tmp'), 'utf8') !== json(manifest) || hash(json(capture())) !== fingerprint) fail();
    if (hash(readFileSync(join(output, 'snapshot.json'))) !== hash(snapshotBytes)) fail();
    if (version === 2 && validateQaEnvelope(JSON.parse(readFileSync(join(output, 'manifest.tmp'), 'utf8')).envelope).status === 'BLOCKED') fail();
    renameSync(join(output, 'manifest.tmp'), join(output, 'manifest.json'));
    const status = version === 2 ? manifest.result.status : manifest.status;
    return { status, output, manifest, exitCode: status === 'QA_REVIEW' ? 0 : 1 };
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
