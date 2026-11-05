/** QA envelope V1: pure validation of JSON data, never authorization or attestation. */
export const LIMITS = Object.freeze({ paths: 1000, checks: 100, reasons: 100, text: 500, path: 240, fileBytes: 67108864, reviewBytes: 262144 });
const sha = /^[a-f0-9]{64}$/;
const gitSha = /^[a-f0-9]{40}$/;
const codes = ['BASE_CONTENT_UNAVAILABLE', 'INDEX_CONTENT_UNAVAILABLE', 'CONTENT_UNAVAILABLE', 'BINARY', 'TOO_LARGE', 'POSSIBLE_SECRET', 'OUT_OF_SCOPE'];
const own = (o, k) => Object.hasOwn(o, k);
const require = (ok, code) => { if (!ok) throw code; };
function object(o, keys, optional = []) {
  require(o !== null && typeof o === 'object' && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype, 'INVALID_SCHEMA');
  require(Object.keys(o).every(k => keys.includes(k) || optional.includes(k)) && keys.every(k => own(o, k)), 'INVALID_SCHEMA');
}
function array(a, max) { require(Array.isArray(a) && a.length <= max && Object.keys(a).length === a.length, 'INVALID_ARRAY'); }
function text(s, max = LIMITS.text) { require(typeof s === 'string' && s.length > 0 && s.length <= max && !/[\x00-\x1f\x7f-\x9f]/.test(s), 'INVALID_TEXT'); }
function digest(s, regex = sha) { require(typeof s === 'string' && regex.test(s), 'INVALID_SHA'); }
function path(p) {
  text(p, LIMITS.path);
  require(p === p.normalize('NFC') && !/[\\:*?"<>|%{}\[\]]/.test(p) && !/[\ud800-\udfff]/u.test(p)
    && !/\p{Cf}/u.test(p) && p.split('/').every(c => c && c !== '.' && c !== '..' && !/[. ]$/.test(c)
      && !/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(c)), 'UNSAFE_PATH');
  return p;
}
function paths(a) {
  array(a, LIMITS.paths);
  a.forEach(path);
  require(new Set(a.map(p => p.toLowerCase())).size === a.length, 'DUPLICATE_PATH');
}
function strings(a) { array(a, LIMITS.reasons); a.forEach(s => text(s)); require(new Set(a).size === a.length, 'DUPLICATE_REASON'); }
const identityKeys = ['repository', 'issueNumber', 'approvedIssueSha256', 'branch', 'baseSha', 'headSha', 'worktreeId'];
const hashKeys = ['diffSha256', 'snapshotSha256', 'fingerprintSha256'];

/** Accept plain JSON values only. Invalid input returns no envelope or exportable paths. */
export function validateQaEnvelope(input) {
  const reasons = new Set();
  try {
    object(input, ['schemaVersion', ...identityKeys, ...hashKeys, 'scope', 'inventory', 'limitations'], ['checks']);
    require(input.schemaVersion === 1, 'UNKNOWN_VERSION');
    require(input.repository === 'gclp96/zaping' && Number.isSafeInteger(input.issueNumber) && input.issueNumber > 0
      && input.branch === `codex/agent-issue-${input.issueNumber}`, 'INVALID_IDENTITY');
    for (const k of ['approvedIssueSha256', 'worktreeId', ...hashKeys]) digest(input[k]);
    digest(input.baseSha, gitSha); digest(input.headSha, gitSha);
    const scope = input.scope;
    object(scope, ['authority', 'operatorId', 'issueNumber', 'approvedIssueSha256', 'allowedPaths', 'forbiddenPaths']);
    text(scope.operatorId, 100);
    require(scope.authority === 'OPERATOR' && scope.issueNumber === input.issueNumber
      && scope.approvedIssueSha256 === input.approvedIssueSha256, 'INVALID_POLICY');
    paths(scope.allowedPaths); paths(scope.forbiddenPaths);
    require(scope.allowedPaths.length > 0 && !scope.allowedPaths.some(p => scope.forbiddenPaths.some(q => p.toLowerCase() === q.toLowerCase())), 'INVALID_POLICY');
    const allowed = p => scope.allowedPaths.includes(p) && !scope.forbiddenPaths.includes(p);
    array(input.inventory, LIMITS.paths);
    paths(input.inventory.map(e => e?.path));
    if (input.inventory.length === 0) reasons.add('INVENTORY_EMPTY');
    const renameSources = new Set();
    const exportablePaths = [];
    for (const e of input.inventory) {
      object(e, ['path', 'status', 'kind', 'size', 'sha256', 'base', 'index', 'excluded', 'evidenceGaps'], ['originalPath']);
      require(e.kind === 'REGULAR', 'UNSAFE_FILE_KIND');
      require(typeof e.status === 'string' && /^(\?\?|[ MARD][ MD])$/.test(e.status) && e.status !== '  ', 'INVALID_GIT_STATUS');
      const rename = e.status[0] === 'R';
      require(rename === own(e, 'originalPath'), 'INVALID_RENAME');
      if (rename) {
        path(e.originalPath);
        require(e.originalPath !== e.path, 'INVALID_RENAME');
        const sourceKey = e.originalPath.toLowerCase();
        require(!renameSources.has(sourceKey), 'DUPLICATE_RENAME_SOURCE');
        renameSources.add(sourceKey);
      }
      require(e.size === null || (Number.isSafeInteger(e.size) && e.size >= 0 && e.size <= LIMITS.fileBytes), 'INVALID_SIZE');
      if (e.sha256 !== null) digest(e.sha256);
      require((e.size === null) === (e.sha256 === null), 'INVALID_CONTENT_METADATA');
      require([null, ...codes].includes(e.excluded), 'INVALID_EXCLUSION');
      strings(e.evidenceGaps);
      require(e.evidenceGaps.every(c => codes.includes(c)), 'INVALID_GAP');
      e.evidenceGaps.forEach(c => reasons.add(c));
      // An untracked file has no base or index layers by definition.
      require(e.status !== '??' || (e.base === null && e.index === null), 'INVALID_GIT_METADATA');
      for (const layer of ['base', 'index']) {
        const v = e[layer];
        if (v !== null) { object(v, ['size', 'sha256']); require(Number.isSafeInteger(v.size) && v.size >= 0 && v.size <= LIMITS.reviewBytes, 'INVALID_SIZE'); digest(v.sha256); }
      }
      // Scope violations block the whole envelope; no partial content eligibility.
      require(allowed(e.path) && (!rename || allowed(e.originalPath)), 'OUT_OF_SCOPE');
      require(e.excluded !== 'OUT_OF_SCOPE' && !e.evidenceGaps.includes('OUT_OF_SCOPE'), 'OUT_OF_SCOPE');
      if (e.excluded) reasons.add(e.excluded);
      const deleted = e.status.includes('D');
      if (deleted || e.status !== '??' && e.status[0] !== 'A') {
        if (!e.base) reasons.add('BASE_CONTENT_UNAVAILABLE');
      }
      if (e.status[0] !== ' ' && e.status !== '??' && !e.index) reasons.add('INDEX_CONTENT_UNAVAILABLE');
      if (deleted) reasons.add('DELETED_CONTENT');
      else if (e.size === null) reasons.add('CONTENT_UNAVAILABLE');
      if (e.size > LIMITS.reviewBytes) reasons.add('TOO_LARGE');
      if (!deleted && !e.excluded && e.size !== null && e.size <= LIMITS.reviewBytes && e.evidenceGaps.length === 0) exportablePaths.push(e.path);
    }
    strings(input.limitations);
    if (input.limitations.length) reasons.add('DECLARED_LIMITATIONS');
    const checks = input.checks ?? [{ name: 'verify-local', status: 'NOT_RUN', source: { kind: 'NOT_RUN', id: 'not-run' }, binding: 'UNVERIFIED' }];
    array(checks, LIMITS.checks);
    require(new Set(checks.map(c => c?.name)).size === checks.length, 'DUPLICATE_CHECK');
    if (!checks.length) reasons.add('CHECKS_MISSING');
    const normalizedChecks = checks.map(c => {
      object(c, ['name', 'source'], ['status', 'binding']); text(c.name, 100);
      object(c.source, ['kind', 'id']); text(c.source.id, 200);
      require(['LOCAL_VERIFIER', 'GITHUB_CI', 'NOT_RUN'].includes(c.source.kind), 'INVALID_CHECK_SOURCE');
      const status = c.status ?? 'NOT_RUN';
      require(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(status), 'INVALID_CHECK_STATUS');
      const b = c.binding ?? 'UNVERIFIED';
      let bound = false;
      if (b !== 'UNVERIFIED') {
        object(b, [...identityKeys, ...hashKeys], ['publishedCommitSha']);
        require(b.repository === 'gclp96/zaping' && Number.isSafeInteger(b.issueNumber) && b.issueNumber > 0
          && b.branch === `codex/agent-issue-${b.issueNumber}`, 'INVALID_BINDING');
        for (const k of ['approvedIssueSha256', 'worktreeId', ...hashKeys]) digest(b[k]);
        digest(b.baseSha, gitSha); digest(b.headSha, gitSha);
        if (own(b, 'publishedCommitSha')) digest(b.publishedCommitSha, gitSha);
        bound = [...identityKeys, ...hashKeys].every(k => b[k] === input[k]);
        if (c.source.kind === 'GITHUB_CI') bound &&= b.publishedCommitSha === input.headSha;
      }
      if (!bound || c.source.kind === 'NOT_RUN') reasons.add('CHECK_UNVERIFIED');
      if (status !== 'PASS') reasons.add(`CHECK_${status}`);
      const verified = bound && c.source.kind !== 'NOT_RUN';
      return { name: c.name, source: { ...c.source }, status: verified ? status : 'NOT_RUN', binding: verified ? { ...b } : 'UNVERIFIED' };
    });
    const envelope = structuredClone(input);
    envelope.checks = normalizedChecks;
    return { status: reasons.size ? 'INSUFFICIENT_EVIDENCE' : 'QA_REVIEW', reasons: [...reasons].sort(), envelope, exportablePaths: exportablePaths.sort() };
  } catch (code) {
    return { status: 'BLOCKED', reasons: [typeof code === 'string' ? code : 'INVALID_SCHEMA'], envelope: null, exportablePaths: [] };
  }
}
