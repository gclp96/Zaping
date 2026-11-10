/**
 * QA-REVIEW-01C1-A: pure, deterministic validation of an already-received
 * SyntheticTransferV1. This module is NOT a loader, sandbox or authorization.
 * Do not add filesystem, Git, process execution, network or model access.
 */
import { createHash } from 'node:crypto';

export const SYNTHETIC_TRANSFER_LIMITS = Object.freeze({
  packageBytes: 2 * 1024 * 1024,
  scopeBytes: 64 * 1024,
  entries: 16,
  entryBytes: 256 * 1024,
  totalBytes: 1024 * 1024,
  pathBytes: 240,
  scopePaths: 1000,
  packageDepth: 8,
  scopeDepth: 6,
  packageNodes: 1024,
  scopeNodes: 4096,
});

const LIMITS = SYNTHETIC_TRANSFER_LIMITS;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = 'gclp96/zaping';
const ALLOWED_OPERATIONS = new Set(['TRACKED_WORKTREE_MODIFY', 'UNTRACKED_CREATE']);
const ERROR_CODES = new Set([
  'INVALID_BYTES', 'LIMIT_EXCEEDED', 'INVALID_EXPECTATION', 'INVALID_UTF8',
  'INVALID_BOM', 'INVALID_JSON', 'DUPLICATE_KEY', 'UNSAFE_KEY',
  'INVALID_UNICODE', 'INVALID_SCHEMA', 'INVALID_SCOPE',
  'SCOPE_HASH_MISMATCH', 'BASE_SHA_MISMATCH', 'UNSAFE_PATH',
  'OUT_OF_SCOPE', 'DUPLICATE_PATH', 'UNSUPPORTED_OPERATION',
  'INVALID_MODE', 'CONTENT_SIZE_MISMATCH', 'CONTENT_SHA_MISMATCH',
  'POSSIBLE_SECRET', 'NOT_SAFE_FOR_STAGE',
]);
const LIMITATIONS = Object.freeze([
  'Internal format, scope and hash consistency only; provenance is unverified externally.',
  'A secret scan is heuristic and does not prove that content is synthetic or safe to disclose.',
  'No Git verification, staging, execution, model transfer, CI approval or authorization.',
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reject = code => { throw code; };
const ensure = (condition, code) => { if (!condition) reject(code); };

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value, keys) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length
    && keys.every(key => Object.hasOwn(value, key))
    && actual.every(key => keys.includes(key));
}

// expected is provided by a trusted operator, not by proposal JSON. Accept only
// a plain data record without accessors; snapshot its five primitive fields.
function copyExpected(value) {
  ensure(plainObject(value), 'INVALID_EXPECTATION');
  const keys = ['repository', 'issueNumber', 'approvedIssueSha256', 'scopeSha256', 'expectedBaseSha'];
  ensure(hasExactKeys(value, keys) && Reflect.ownKeys(value).length === keys.length, 'INVALID_EXPECTATION');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  ensure(keys.every(key => Object.hasOwn(descriptors[key], 'value')), 'INVALID_EXPECTATION');
  const expected = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
  ensure(expected.repository === REPOSITORY
    && Number.isSafeInteger(expected.issueNumber) && expected.issueNumber > 0
    && typeof expected.approvedIssueSha256 === 'string' && SHA256.test(expected.approvedIssueSha256)
    && typeof expected.scopeSha256 === 'string' && SHA256.test(expected.scopeSha256)
    && typeof expected.expectedBaseSha === 'string' && GIT_SHA.test(expected.expectedBaseSha),
  'INVALID_EXPECTATION');
  return expected;
}

function copyBoundedBytes(input, maximum) {
  ensure(input instanceof Uint8Array, 'INVALID_BYTES');
  ensure(input.byteLength > 0 && input.byteLength <= maximum, 'LIMIT_EXCEEDED');
  // A copy protects the hash/parse operation from later mutation of the caller's
  // view. It does not provide atomic reads from concurrently hostile writers.
  return Buffer.from(input);
}

function noLoneSurrogates(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

// A bounded JSON structural scanner rejects duplicate decoded member names,
// dangerous keys, ill-formed Unicode and excessive depth BEFORE JSON.parse.
// JSON substrings embedded inside strings are treated only as string data.
function parseStrict(bytes, maximumDepth, maximumNodes) {
  ensure(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), 'INVALID_BOM');
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { reject('INVALID_UTF8'); }
  let cursor = 0;
  let nodes = 0;
  const numberOrLiteral = /(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;
  const whitespace = () => {
    while (cursor < source.length && /[ \t\r\n]/.test(source[cursor])) cursor++;
  };
  const string = () => {
    ensure(source[cursor] === '"', 'INVALID_JSON');
    const start = cursor++;
    let closed = false;
    while (cursor < source.length) {
      const character = source[cursor++];
      if (character === '"') { closed = true; break; }
      if (character === '\\') {
        const escaped = source[cursor++];
        ensure(escaped !== undefined && '"\\/bfnrtu'.includes(escaped), 'INVALID_JSON');
        if (escaped === 'u') {
          ensure(/^[0-9a-fA-F]{4}$/.test(source.slice(cursor, cursor + 4)), 'INVALID_JSON');
          cursor += 4;
        }
      } else ensure(character >= ' ' && character !== '\x7f', 'INVALID_JSON');
    }
    ensure(closed, 'INVALID_JSON');
    let value;
    try { value = JSON.parse(source.slice(start, cursor)); }
    catch { reject('INVALID_JSON'); }
    ensure(noLoneSurrogates(value), 'INVALID_UNICODE');
    return value;
  };
  const value = depth => {
    ensure(depth <= maximumDepth && ++nodes <= maximumNodes, 'LIMIT_EXCEEDED');
    whitespace();
    const character = source[cursor];
    if (character === '{') {
      cursor++; whitespace();
      const names = new Set();
      if (source[cursor] !== '}') for (;;) {
        const key = string();
        ensure(++nodes <= maximumNodes, 'LIMIT_EXCEEDED');
        ensure(!names.has(key), 'DUPLICATE_KEY');
        ensure(!['__proto__', 'prototype', 'constructor'].includes(key), 'UNSAFE_KEY');
        names.add(key);
        whitespace(); ensure(source[cursor++] === ':', 'INVALID_JSON');
        value(depth + 1);
        whitespace();
        if (source[cursor] !== ',') break;
        cursor++; whitespace();
      }
      ensure(source[cursor++] === '}', 'INVALID_JSON');
    } else if (character === '[') {
      cursor++; whitespace();
      if (source[cursor] !== ']') for (;;) {
        value(depth + 1);
        whitespace();
        if (source[cursor] !== ',') break;
        cursor++; whitespace();
      }
      ensure(source[cursor++] === ']', 'INVALID_JSON');
    } else if (character === '"') string();
    else {
      numberOrLiteral.lastIndex = cursor;
      const match = numberOrLiteral.exec(source);
      ensure(match, 'INVALID_JSON');
      cursor += match[0].length;
      if (/^[-\d]/.test(match[0])) ensure(Number.isFinite(Number(match[0])), 'INVALID_JSON');
    }
  };
  value(0); whitespace(); ensure(cursor === source.length, 'INVALID_JSON');
  try { return JSON.parse(source); } catch { reject('INVALID_JSON'); }
}

function validatePath(path) {
  ensure(typeof path === 'string' && path.length > 0 && path.length <= LIMITS.pathBytes
    && /^[\x00-\x7f]+$/.test(path), 'UNSAFE_PATH');
  const segments = path.split('/');
  for (const segment of segments) {
    ensure(/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(segment) && !segment.endsWith('.'), 'UNSAFE_PATH');
    ensure(!/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(segment), 'UNSAFE_PATH');
    const lower = segment.toLowerCase();
    ensure(!new Set(['.git', '.github', '.env', '.ssh', 'node_modules',
      'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock',
      'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'cargo.lock', 'poetry.lock',
      'pipfile.lock', 'dockerfile']).has(lower) && !lower.startsWith('docker-compose'),
    'UNSAFE_PATH');
  }
  ensure(!(segments[0]?.toLowerCase() === 'scripts' && segments[1]?.toLowerCase() === 'agents'), 'UNSAFE_PATH');
  return path;
}

function collisions(paths) {
  // An adjacent-only sort check misses a file/child conflict when a sibling
  // sorts between them (e.g. docs/a, docs/a-, docs/a/b.txt).
  const lowered = paths.map(path => path.toLowerCase());
  const unique = new Set(lowered);
  if (unique.size !== lowered.length) reject('DUPLICATE_PATH');
  for (const path of lowered) {
    let separator = path.indexOf('/');
    while (separator !== -1) {
      if (unique.has(path.slice(0, separator))) reject('DUPLICATE_PATH');
      separator = path.indexOf('/', separator + 1);
    }
  }
}

function validateScope(scope, expected, copiedScope) {
  ensure(hasExactKeys(scope, ['authority', 'operatorId', 'issueNumber', 'approvedIssueSha256', 'allowedPaths', 'forbiddenPaths']), 'INVALID_SCOPE');
  ensure(scope.authority === 'OPERATOR'
    && typeof scope.operatorId === 'string' && scope.operatorId.length > 0 && scope.operatorId.length <= 100
    && !/[\x00-\x1f\x7f-\x9f]/.test(scope.operatorId)
    && Number.isSafeInteger(scope.issueNumber) && scope.issueNumber > 0
    && typeof scope.approvedIssueSha256 === 'string' && SHA256.test(scope.approvedIssueSha256)
    && Array.isArray(scope.allowedPaths) && scope.allowedPaths.length >= 1 && scope.allowedPaths.length <= LIMITS.scopePaths
    && Array.isArray(scope.forbiddenPaths) && scope.forbiddenPaths.length <= LIMITS.scopePaths,
  'INVALID_SCOPE');
  for (const path of [...scope.allowedPaths, ...scope.forbiddenPaths]) validatePath(path);
  // Check each side and their union: a path may not shadow a forbidden folder.
  collisions([...scope.allowedPaths, ...scope.forbiddenPaths]);
  ensure(hash(copiedScope) === expected.scopeSha256, 'SCOPE_HASH_MISMATCH');
  ensure(scope.issueNumber === expected.issueNumber && scope.approvedIssueSha256 === expected.approvedIssueSha256,
    'INVALID_SCOPE');
  return new Set(scope.allowedPaths);
}

const possibleSecret = text => /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,}|AKIA[A-Z0-9]{16}|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:password|secret|token|api[_-]?key)\s*[=:]\s*["']?[^\s"';,]{8,}|[a-z]{1,16}:\/\/[^\s/:]+:[^\s/@]+@/i.test(text);

function validatePackage(pack, expected, allowed) {
  ensure(hasExactKeys(pack, ['schemaVersion', 'kind', 'declaredBaseSha', 'entries'])
    && pack.schemaVersion === 1 && pack.kind === 'SYNTHETIC_TRANSFER'
    && typeof pack.declaredBaseSha === 'string' && GIT_SHA.test(pack.declaredBaseSha)
    && Array.isArray(pack.entries) && pack.entries.length >= 1 && pack.entries.length <= LIMITS.entries,
  'INVALID_SCHEMA');
  ensure(pack.declaredBaseSha === expected.expectedBaseSha, 'BASE_SHA_MISMATCH');
  let total = 0;
  const paths = [];
  const entries = [];
  for (const entry of pack.entries) {
    ensure(hasExactKeys(entry, ['path', 'operation', 'mode', 'contentUtf8', 'sizeBytes', 'sha256']), 'INVALID_SCHEMA');
    validatePath(entry.path);
    ensure(allowed.has(entry.path), 'OUT_OF_SCOPE');
    ensure(ALLOWED_OPERATIONS.has(entry.operation), 'UNSUPPORTED_OPERATION');
    ensure(entry.mode === '100644', 'INVALID_MODE');
    ensure(typeof entry.contentUtf8 === 'string', 'INVALID_SCHEMA');
    const content = entry.contentUtf8;
    ensure(!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(content), 'NOT_SAFE_FOR_STAGE');
    const contentBytes = Buffer.from(content, 'utf8');
    ensure(contentBytes.length <= LIMITS.entryBytes, 'LIMIT_EXCEEDED');
    total += contentBytes.length;
    ensure(total <= LIMITS.totalBytes, 'LIMIT_EXCEEDED');
    ensure(Number.isSafeInteger(entry.sizeBytes) && entry.sizeBytes === contentBytes.length, 'CONTENT_SIZE_MISMATCH');
    ensure(typeof entry.sha256 === 'string' && SHA256.test(entry.sha256)
      && hash(contentBytes) === entry.sha256, 'CONTENT_SHA_MISMATCH');
    ensure(!possibleSecret(content), 'POSSIBLE_SECRET');
    paths.push(entry.path);
    entries.push({ path: entry.path, operation: entry.operation, mode: '100644',
      sizeBytes: contentBytes.length, sha256: entry.sha256 });
  }
  collisions(paths);
  for (let i = 1; i < paths.length; i++) ensure(paths[i - 1] < paths[i], 'DUPLICATE_PATH');
  return entries;
}

/**
 * Parse only bounded bytes that an independent operator has already selected.
 * A successful return NEVER authorizes staging, execution or disclosure.
 */
export function parseSyntheticTransferV1(input = {}) {
  try {
    const inputKeys = ['packageBytes', 'approvedScopeBytes', 'expected'];
    ensure(hasExactKeys(input, inputKeys) && Reflect.ownKeys(input).length === inputKeys.length, 'INVALID_SCHEMA');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    ensure(inputKeys.every(key => Object.hasOwn(descriptors[key], 'value')), 'INVALID_SCHEMA');
    const { packageBytes, approvedScopeBytes, expected } = Object.fromEntries(
      inputKeys.map(key => [key, descriptors[key].value]));
    // Order is intentional: first bound/copy both views, then validate expected,
    // parse package and scope, validate scope, and finally validate package.
    const packageCopy = copyBoundedBytes(packageBytes, LIMITS.packageBytes);
    const scopeCopy = copyBoundedBytes(approvedScopeBytes, LIMITS.scopeBytes);
    const trusted = copyExpected(expected);
    const pack = parseStrict(packageCopy, LIMITS.packageDepth, LIMITS.packageNodes);
    const scope = parseStrict(scopeCopy, LIMITS.scopeDepth, LIMITS.scopeNodes);
    const allowed = validateScope(scope, trusted, scopeCopy);
    const entries = validatePackage(pack, trusted, allowed);
    return { status: 'ACCEPTED_SYNTHETIC_DATA', packageSha256: hash(packageCopy), entries,
      reasons: [], provenance: 'UNVERIFIED_EXTERNALLY', limitations: [...LIMITATIONS] };
  } catch (error) {
    return { status: 'BLOCKED', packageSha256: null, entries: [],
      reasons: [typeof error === 'string' && ERROR_CODES.has(error) ? error : 'INVALID_SCHEMA'],
      provenance: 'UNVERIFIED_EXTERNALLY', limitations: [...LIMITATIONS] };
  }
}
