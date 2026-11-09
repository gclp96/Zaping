/** QA-BUNDLE V2 deterministic, bytes-only validator. Never authorizes inference/actions. */
import { createHash } from 'node:crypto';
import { validateQaEnvelope } from './qa-contract.mjs';

const MAX = Object.freeze({ manifest: 2 * 1024 * 1024, snapshot: 1024 * 1024, policy: 64 * 1024, depth: 48, nodes: 300000 });
const PROFILE = Object.freeze({ fileBytes: 262144, totalBytes: 1048576, paths: 1000, processBytes: 8388608,
  tableEntries: 50000, commands: 30000, commandBytes: 67108864, durationMs: 120000 });
const LIMITATIONS = Object.freeze([
  'Human review required; secret detection is heuristic.',
  'Checks are not attested.',
  'Concurrent writers require external isolation.',
]);
const SHA = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const own = (o, k) => Object.hasOwn(o, k);
const fail = code => { throw code; };
const check = (ok, code = 'INVALID_SCHEMA') => { if (!ok) fail(code); };
const hash = data => createHash('sha256').update(data).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
function shape(obj, required, optional = []) {
  check(object(obj));
  const keys = Object.keys(obj);
  check(required.every(k => own(obj, k)) && keys.every(k => required.includes(k) || optional.includes(k)));
}
function array(v, max = MAX.nodes) { check(Array.isArray(v) && v.length <= max && Object.keys(v).length === v.length); }
function digest(v, git = false) { check(typeof v === 'string' && (git ? GIT_SHA : SHA).test(v), 'INVALID_SHA'); }
function text(v, max = 500) { check(typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f-\x9f]/.test(v), 'INVALID_TEXT'); }

// Structural JSON scanner. Rejects repeated decoded member names at every depth,
// including escaped duplicates. JSON snippets inside strings are never scanned as objects.
// Values are parsed by JSON.parse only after the entire byte string passed this scanner.
function parseStrict(bytes, limit) {
  check(bytes instanceof Uint8Array && bytes.byteLength <= limit, 'INVALID_BYTES');
  check(!(bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191), 'INVALID_BOM');
  let raw;
  try { raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail('INVALID_UTF8'); }
  let i = 0, nodes = 0;
  const primitive = /(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;
  const space = () => { while (i < raw.length && /[ \r\n\t]/.test(raw[i])) i++; };
  const string = () => {
    check(raw[i] === '"', 'INVALID_JSON');
    const start = i++;
    let end = false;
    while (i < raw.length) {
      const c = raw[i++];
      if (c === '"') { end = true; break; }
      if (c === '\\') {
        const esc = raw[i++];
        check(esc !== undefined && '"\\/bfnrtu'.includes(esc), 'INVALID_JSON');
        if (esc === 'u') { check(/^[\da-fA-F]{4}$/.test(raw.slice(i, i + 4)), 'INVALID_JSON'); i += 4; }
      } else check(c >= ' ' && c !== '\x7f', 'INVALID_JSON');
    }
    check(end, 'INVALID_JSON');
    const value = JSON.parse(raw.slice(start, i));
    check(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(value), 'INVALID_UNICODE');
    return value;
  };
  const value = depth => {
    check(depth <= MAX.depth && ++nodes <= MAX.nodes, 'LIMIT_EXCEEDED');
    space(); const c = raw[i];
    if (c === '{') {
      i++; space(); const keys = new Set();
      if (raw[i] !== '}') for (;;) {
        const k = string();
        check(!keys.has(k), 'DUPLICATE_KEY');
        check(!['__proto__', 'prototype', 'constructor'].includes(k), 'UNSAFE_KEY');
        keys.add(k); space(); check(raw[i++] === ':', 'INVALID_JSON');
        value(depth + 1); space();
        if (raw[i] !== ',') break;
        i++; space();
      }
      check(raw[i++] === '}', 'INVALID_JSON');
    } else if (c === '[') {
      i++; space();
      if (raw[i] !== ']') for (;;) {
        value(depth + 1); space();
        if (raw[i] !== ',') break;
        i++;
      }
      check(raw[i++] === ']', 'INVALID_JSON');
    } else if (c === '"') string();
    else {
      primitive.lastIndex = i;
      const match = primitive.exec(raw);
      check(match, 'INVALID_JSON');
      i += match[0].length;
      if (match[0][0] === '-' || /\d/.test(match[0][0])) check(Number.isFinite(Number(match[0])), 'INVALID_NUMBER');
    }
  };
  value(0); space(); check(i === raw.length, 'INVALID_JSON');
  try { return JSON.parse(raw); } catch { fail('INVALID_JSON'); }
}

function expectedInput(e) {
  shape(e, ['repository', 'issueNumber', 'approvedIssueSha256', 'scopeSha256', 'branch', 'baseSha', 'headSha', 'worktreeId']);
  check(e.repository === 'gclp96/zaping' && Number.isSafeInteger(e.issueNumber) && e.issueNumber > 0, 'INVALID_EXPECTATION');
  check(e.branch === `codex/agent-issue-${e.issueNumber}`, 'INVALID_EXPECTATION');
  for (const k of ['approvedIssueSha256', 'scopeSha256', 'worktreeId']) digest(e[k]);
  for (const k of ['baseSha', 'headSha']) digest(e[k], true);
}
function sameArray(a, b) { return Array.isArray(a) && Array.isArray(b) && equal(a, b); }
function layer(data) {
  if (data === null) return;
  shape(data, ['mode', 'size', 'sha256', 'content']);
  check(data.mode === '100644' || data.mode === '100755');
  check(typeof data.content === 'string');
  const payload = Buffer.from(data.content, 'utf8');
  check(payload.length <= PROFILE.fileBytes && data.size === payload.length, 'INVALID_LAYER_SIZE');
  digest(data.sha256); check(hash(payload) === data.sha256, 'LAYER_HASH_MISMATCH');
  check(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(data.content), 'INVALID_LAYER_TEXT');
}
function scopeCheck(s) {
  shape(s, ['authority', 'operatorId', 'issueNumber', 'approvedIssueSha256', 'allowedPaths', 'forbiddenPaths']);
  check(s.authority === 'OPERATOR'); text(s.operatorId, 100);
  digest(s.approvedIssueSha256); check(Number.isSafeInteger(s.issueNumber) && s.issueNumber > 0);
  array(s.allowedPaths, PROFILE.paths); array(s.forbiddenPaths, PROFILE.paths);
  for (const p of [...s.allowedPaths, ...s.forbiddenPaths]) text(p, 240);
}
function validateInternal(manifest, snapshot, scope, expected, snapshotBytes, scopeBytes) {
  shape(manifest, ['schemaVersion', 'scopeSha256', 'envelope', 'result', 'metadata', 'limits']);
  shape(snapshot, ['schemaVersion', 'files']);
  check(manifest.schemaVersion === 2 && snapshot.schemaVersion === 2, 'UNKNOWN_VERSION');
  shape(manifest.limits, Object.keys(PROFILE));
  for (const [k, v] of Object.entries(PROFILE)) check(manifest.limits[k] === v, 'INVALID_PRODUCER_LIMITS');
  scopeCheck(scope);
  check(hash(scopeBytes) === expected.scopeSha256 && manifest.scopeSha256 === expected.scopeSha256, 'SCOPE_HASH_MISMATCH');
  const e = manifest.envelope;
  shape(e, ['schemaVersion','repository','issueNumber','approvedIssueSha256','branch','baseSha','headSha','worktreeId','scope','inventory','limitations','checks','diffSha256','snapshotSha256','fingerprintSha256']);
  check(e.schemaVersion === 1, 'UNKNOWN_VERSION');
  for (const key of ['repository','issueNumber','approvedIssueSha256','branch','baseSha','headSha','worktreeId'])
    check(e[key] === expected[key], 'IDENTITY_MISMATCH');
  check(e.scope.issueNumber === scope.issueNumber && e.scope.approvedIssueSha256 === scope.approvedIssueSha256, 'SCOPE_MISMATCH');
  // Policy object membership is unordered, but path array order is producer data.
  shape(e.scope, ['authority', 'operatorId', 'issueNumber', 'approvedIssueSha256', 'allowedPaths', 'forbiddenPaths']);
  for (const key of ['authority','operatorId','issueNumber','approvedIssueSha256']) check(e.scope[key] === scope[key], 'SCOPE_MISMATCH');
  for (const key of ['allowedPaths','forbiddenPaths']) check(sameArray(e.scope[key], scope[key]), 'SCOPE_MISMATCH');
  check(hash(snapshotBytes) === e.snapshotSha256, 'SNAPSHOT_HASH_MISMATCH');
  digest(e.fingerprintSha256); digest(e.diffSha256);
  array(e.checks); check(e.checks.length === 1, 'FORGED_CHECK');
  shape(e.checks[0], ['name','source','status','binding']);
  shape(e.checks[0].source, ['kind','id']);
  check(e.checks[0].name === 'verify-local' && e.checks[0].status === 'NOT_RUN' && e.checks[0].binding === 'UNVERIFIED'
    && e.checks[0].source.kind === 'NOT_RUN' && e.checks[0].source.id === 'not-run', 'FORGED_CHECK');
  check(sameArray(e.limitations, LIMITATIONS), 'FORGED_LIMITATIONS');
  array(e.inventory, PROFILE.paths); array(snapshot.files, PROFILE.paths); array(manifest.metadata, PROFILE.paths);
  check(e.inventory.length === snapshot.files.length && e.inventory.length === manifest.metadata.length, 'INVENTORY_MISMATCH');
  const reconstructed = [];
  for(let n = 0; n < e.inventory.length; n++) {
    const item = e.inventory[n], m = manifest.metadata[n], file = snapshot.files[n];
    shape(m, ['path','status','size','sha256','identity','excluded','evidenceGaps'], ['originalPath']);
    shape(file, ['path','working','base','index'], ['originalPath']);
    check(item.path === m.path && item.path === file.path, 'INVENTORY_MISMATCH');
    check(item.status === m.status && item.size === m.size && item.sha256 === m.sha256 && item.excluded === m.excluded, 'INVENTORY_MISMATCH');
    check(own(item, 'originalPath') === own(m, 'originalPath') && own(item,'originalPath') === own(file,'originalPath'), 'INVENTORY_MISMATCH');
    if (own(item,'originalPath')) check(item.originalPath === m.originalPath && item.originalPath === file.originalPath, 'INVENTORY_MISMATCH');
    check(sameArray(item.evidenceGaps, m.evidenceGaps), 'INVENTORY_MISMATCH');
    check(m.identity === null || (Array.isArray(m.identity) && m.identity.length === 9 && m.identity.every(x=>typeof x === 'string')), 'INVALID_IDENTITY_METADATA');
    check(item.kind === 'REGULAR');
    for (const k of ['working','base','index']) layer(file[k]);
    for (const k of ['base','index']) {
      const summary = file[k] === null ? null : { size: file[k].size, sha256: file[k].sha256 };
      check(equal(item[k], summary), 'LAYER_METADATA_MISMATCH');
    }
    if (m.excluded !== null) check(file.working === null && file.base === null && file.index === null, 'EXCLUDED_CONTENT');
    if (item.status.includes('D')) {
      check(file.working === null, 'DELETED_CONTENT');
      // captureLayers() emits no current-file size/hash/identity for either deletion status.
      check(item.size === null && item.sha256 === null && m.identity === null, 'INVALID_DELETED_METADATA');
    } else {
      // readEntry() records nine-field identity for every non-deleted file,
      // including a file whose layers were excluded for secrets/size/binary.
      check(m.identity !== null, 'INVALID_IDENTITY_METADATA');
    }
    if (file.working !== null) check(file.working.size === item.size && file.working.sha256 === item.sha256, 'WORKING_METADATA_MISMATCH');
    else if (item.size !== null && m.excluded === null && !item.status.includes('D')) fail('WORKING_CONTENT_MISSING');
    reconstructed.push({path:m.path, status:m.status, ...(own(m,'originalPath') ? {originalPath:m.originalPath} : {}),
      size:m.size, sha256:m.sha256, identity:m.identity, working:file.working, base:file.base, index:file.index,
      excluded:m.excluded, evidenceGaps:m.evidenceGaps});
  }
  const before = {branch:e.branch,baseSha:e.baseSha,headSha:e.headSha,worktreeId:e.worktreeId,
    repository:e.repository,issueNumber:e.issueNumber,approvedIssueSha256:e.approvedIssueSha256,scopeSha256:manifest.scopeSha256,
    diffSha256:e.diffSha256,inventory:reconstructed};
  check(hash(Buffer.from(JSON.stringify(before), 'utf8')) === e.fingerprintSha256, 'FINGERPRINT_MISMATCH');
  const base = validateQaEnvelope(e);
  check(base.status !== 'BLOCKED', 'INVALID_ENVELOPE');
  shape(manifest.result, ['status','reasons','exportablePaths']);
  check(manifest.result.status === base.status && sameArray(manifest.result.reasons, base.reasons)
    && sameArray(manifest.result.exportablePaths, base.exportablePaths), 'RESULT_MISMATCH');
  check(base.status === 'INSUFFICIENT_EVIDENCE', 'FORGED_RESULT');
  return {
    status:'INSUFFICIENT_EVIDENCE', reasons:base.reasons,
    verified:{schemaVersion:2, snapshotSha256:e.snapshotSha256, fingerprintSha256:e.fingerprintSha256,
      internalConsistency:true, provenance:'UNVERIFIED_EXTERNALLY'},
    limitations:['No host provenance or freshness attested.', 'No external CI/test result verified.', 'Never authorizes AI or actions.'],
  };
}

/** Pure validation. All errors fail closed; no content, paths or secrets in result. */
export function validateQaBundleV2({manifestBytes, snapshotBytes, approvedScopeBytes, expected} = {}) {
  try {
    expectedInput(expected);
    // Snapshot caller-provided views once; parse and hash the same bounded copy.
    for (const [input, limit] of [[manifestBytes, MAX.manifest], [snapshotBytes, MAX.snapshot], [approvedScopeBytes, MAX.policy]])
      check(input instanceof Uint8Array && input.byteLength <= limit, 'INVALID_BYTES');
    const manifestCopy = Buffer.from(manifestBytes);
    const snapshotCopy = Buffer.from(snapshotBytes);
    const policyCopy = Buffer.from(approvedScopeBytes);
    const manifest = parseStrict(manifestCopy, MAX.manifest);
    const snapshot = parseStrict(snapshotCopy, MAX.snapshot);
    const scope = parseStrict(policyCopy, MAX.policy);
    return validateInternal(manifest,snapshot,scope,expected,snapshotCopy,policyCopy);
  } catch (error) {
    const codes = new Set(['INVALID_BYTES','INVALID_BOM','INVALID_UTF8','INVALID_JSON','DUPLICATE_KEY','UNSAFE_KEY',
      'INVALID_UNICODE','INVALID_NUMBER','LIMIT_EXCEEDED','INVALID_SHA','INVALID_SCHEMA','INVALID_TEXT','INVALID_EXPECTATION',
      'UNKNOWN_VERSION','INVALID_PRODUCER_LIMITS','SCOPE_HASH_MISMATCH','IDENTITY_MISMATCH','SCOPE_MISMATCH',
      'SNAPSHOT_HASH_MISMATCH','FORGED_CHECK','FORGED_LIMITATIONS','INVENTORY_MISMATCH','INVALID_IDENTITY_METADATA',
      'INVALID_LAYER_SIZE','LAYER_HASH_MISMATCH','INVALID_LAYER_TEXT','LAYER_METADATA_MISMATCH','EXCLUDED_CONTENT',
      'DELETED_CONTENT','INVALID_DELETED_METADATA','WORKING_METADATA_MISMATCH','WORKING_CONTENT_MISSING','FINGERPRINT_MISMATCH',
      'INVALID_ENVELOPE','RESULT_MISMATCH','FORGED_RESULT']);
    return {status:'BLOCKED',reasons:[typeof error === 'string' && codes.has(error) ? error : 'INVALID_SCHEMA'],
      verified:{provenance:'UNVERIFIED_EXTERNALLY'}, limitations:['No permission to disclose content or invoke a model.']};
  }
}
