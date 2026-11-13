/**
 * QA-REVIEW-01C1-B-LOGIC (#268): disposable, synthetic SQLite ledger ONLY.
 * This is NOT a source of trusted inspection, authentication, staging, Git,
 * network, runner or model access. HOST protections remain NOT_RUN.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const LOGIC_LEDGER_CONTRACT = Object.freeze({
  issue: 268,
  node: 'v24.20.0',
  sqlite: '3.53.4',
  schemaVersion: 1,
  ttlMs: 600_000,
  purpose: 'SYNTHETIC_TEST_ONLY',
  simulationOnly: true,
  stagePermission: false,
});

const HASH = /^[0-9a-f]{64}$/;
const BASE = /^[0-9a-f]{40}$/;
const CONFIRMATION = /^[A-Za-z0-9_-]{16,128}$/;
const STATES = new Set(['AUTHORIZED', 'CONSUMED', 'REVOKED', 'EXPIRED', 'INVALIDATED_RESTART']);
const CODE = new Set([
  'INVALID_INPUT', 'DUPLICATE_CONFIRMATION', 'INVALID_BINDING', 'PURPOSE_MISMATCH',
  'ALREADY_CONSUMED', 'REVOKED', 'EXPIRED', 'INVALIDATED_RESTART',
  'GENERATION_MISMATCH', 'CLOCK_UNTRUSTED', 'TRANSITION_CONFLICT',
  'LEDGER_BUSY', 'LEDGER_CORRUPT', 'LEDGER_UNAVAILABLE', 'UNSUPPORTED_RUNTIME',
  'COMMIT_UNCERTAIN',
]);
const sha = (domain, value) => createHash('sha256').update(`${domain}\0${value}`, 'utf8').digest('hex');
const positive = (status, data = {}) => Object.freeze({ status, simulationOnly: true, stagePermission: false, ...data });
const blocked = (code) => positive('BLOCKED', { code: CODE.has(code) ? code : 'LEDGER_UNAVAILABLE' });
const safeMs = (value) => Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER - LOGIC_LEDGER_CONTRACT.ttlMs;
const safeNumber = (value) => {
  if (typeof value === 'bigint') {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new LogicBlock('LEDGER_CORRUPT');
    return Number(value);
  }
  if (!Number.isSafeInteger(value) || value < 0) throw new LogicBlock('LEDGER_CORRUPT');
  return value;
};
const hasExactly = (o, keys) => o !== null && typeof o === 'object' && !Array.isArray(o)
  && Object.getPrototypeOf(o) === Object.prototype
  && Reflect.ownKeys(o).length === keys.length
  && keys.every(k => Object.hasOwn(o, k)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(o, k), 'value'));

class LogicBlock extends Error {
  constructor(code) { super(code); this.code = code; }
}
const requireValid = (value, code = 'INVALID_INPUT') => { if (!value) throw new LogicBlock(code); };

// A fixed field order prevents ambiguous serialization. No proposal data or raw
// confirmation reference is ever recorded in the three ledger tables.
function bindingHash(binding, generation) {
  const keys = ['repository', 'issueNumber', 'approvedIssueSha256', 'scopeSha256',
    'expectedBaseSha', 'packageSha256', 'profile', 'purpose'];
  requireValid(hasExactly(binding, keys), 'INVALID_BINDING');
  requireValid(binding.purpose === LOGIC_LEDGER_CONTRACT.purpose, 'PURPOSE_MISMATCH');
  requireValid(binding.repository === 'gclp96/zaping'
    && binding.issueNumber === 268
    && typeof binding.approvedIssueSha256 === 'string' && HASH.test(binding.approvedIssueSha256)
    && typeof binding.scopeSha256 === 'string' && HASH.test(binding.scopeSha256)
    && typeof binding.expectedBaseSha === 'string' && BASE.test(binding.expectedBaseSha)
    && typeof binding.packageSha256 === 'string' && HASH.test(binding.packageSha256)
    && binding.profile === 'LOGIC_TEST', 'INVALID_BINDING');
  const ordered = keys.map(key => binding[key]);
  return sha('zaping-logic-268-binding-v1', JSON.stringify([...ordered, generation]));
}

function validateRuntime() {
  requireValid(process.version === LOGIC_LEDGER_CONTRACT.node
    && process.versions.sqlite === LOGIC_LEDGER_CONTRACT.sqlite
    && typeof DatabaseSync === 'function', 'UNSUPPORTED_RUNTIME');
}

// Enforces fixture path conventions ONLY; it is not protection against a hostile
// process modifying the filesystem concurrently. That remains HOST scope.
function fixturePath(filePath, creating) {
  requireValid(typeof filePath === 'string' && filePath.length < 1000, 'INVALID_INPUT');
  const absolute = resolve(filePath);
  requireValid(basename(absolute) === 'ledger.sqlite', 'INVALID_INPUT');
  const parent = dirname(absolute);
  const temp = realpathSync.native(tmpdir());
  const canonicalParent = realpathSync.native(parent);
  const rel = relative(temp, canonicalParent);
  requireValid(rel !== '' && !rel.includes(sep) && /^zaping-logic-268-[A-Za-z0-9_-]{6,40}$/.test(rel)
    && !lstatSync(parent).isSymbolicLink(), 'INVALID_INPUT');
  if (creating) {
    requireValid(!existsSync(absolute), 'LEDGER_UNAVAILABLE');
  } else {
    requireValid(existsSync(absolute), 'LEDGER_UNAVAILABLE');
    const st = lstatSync(absolute);
    requireValid(st.isFile() && !st.isSymbolicLink() && realpathSync.native(absolute) === resolve(canonicalParent, 'ledger.sqlite'), 'LEDGER_UNAVAILABLE');
  }
  return absolute;
}

const options = Object.freeze({
  enableForeignKeyConstraints: true,
  enableDoubleQuotedStringLiterals: false,
  allowExtension: false,
  timeout: 250,
  readBigInts: true,
  defensive: true,
});
function openSqlite(file, creating) {
  const db = new DatabaseSync(file, options);
  try {
    db.enableDefensive(true);
    const existingJournal = String(db.prepare('PRAGMA journal_mode').get()?.journal_mode || '').toLowerCase();
    if (!creating) requireValid(existingJournal === 'delete', 'LEDGER_CORRUPT');
    db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = EXTRA; PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;');
    const get = sql => db.prepare(sql).get();
    requireValid(String(get('PRAGMA journal_mode')?.journal_mode).toLowerCase() === 'delete'
      && safeNumber(get('PRAGMA synchronous')?.synchronous) === 3
      && safeNumber(get('PRAGMA foreign_keys')?.foreign_keys) === 1
      && safeNumber(get('PRAGMA trusted_schema')?.trusted_schema) === 0
      && get('SELECT sqlite_version() AS version')?.version === LOGIC_LEDGER_CONTRACT.sqlite,
    'UNSUPPORTED_RUNTIME');
    return db;
  } catch (error) { db.close(); throw error; }
}

function verifySqlite(db) {
  const u = db.prepare('PRAGMA user_version').get()?.user_version;
  requireValid(safeNumber(u) === 1, 'LEDGER_CORRUPT');
  // Match all schema objects and SQL definitions, not just table names.
  // A trigger, view, extra column or weakened CHECK must not be accepted as V1.
  const objects = db.prepare("SELECT name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map(({ name, sql }) => ({ name, sql }));
  requireValid(JSON.stringify(objects) === JSON.stringify(EXPECTED_SCHEMA), 'LEDGER_CORRUPT');
  requireValid(db.prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok', 'LEDGER_CORRUPT');
  requireValid(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'LEDGER_CORRUPT');
  const row = db.prepare('SELECT * FROM ledger_meta WHERE id=1').get();
  requireValid(row && safeNumber(row.schema_version) === 1
    && typeof row.generation === 'string' && /^[0-9a-f]{32}$/.test(row.generation)
    && row.health !== undefined && ['HEALTHY', 'QUARANTINED'].includes(row.health), 'LEDGER_CORRUPT');
  safeNumber(row.last_observed_wall_ms);
  requireValid(safeNumber(db.prepare('SELECT count(*) AS n FROM ledger_meta').get().n) === 1, 'LEDGER_CORRUPT');
  return row;
}

const SCHEMA = `
CREATE TABLE ledger_meta (
  id INTEGER NOT NULL PRIMARY KEY CHECK (id=1),
  schema_version INTEGER NOT NULL CHECK (schema_version=1),
  generation TEXT NOT NULL CHECK(length(generation)=32),
  last_observed_wall_ms INTEGER NOT NULL CHECK(last_observed_wall_ms>=0),
  health TEXT NOT NULL CHECK(health IN ('HEALTHY','QUARANTINED'))
) STRICT;
CREATE TABLE authorizations (
  authorization_ref_hash TEXT NOT NULL PRIMARY KEY CHECK(length(authorization_ref_hash)=64),
  confirmation_ref_hash TEXT NOT NULL UNIQUE CHECK(length(confirmation_ref_hash)=64),
  context_binding_hash TEXT NOT NULL CHECK(length(context_binding_hash)=64),
  purpose TEXT NOT NULL CHECK(purpose='SYNTHETIC_TEST_ONLY'),
  generation TEXT NOT NULL CHECK(length(generation)=32),
  state TEXT NOT NULL CHECK(state IN ('AUTHORIZED','CONSUMED','REVOKED','EXPIRED','INVALIDATED_RESTART')),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
  expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>created_at_ms),
  terminal_at_ms INTEGER,
  CHECK ((state='AUTHORIZED' AND terminal_at_ms IS NULL) OR (state!='AUTHORIZED' AND terminal_at_ms IS NOT NULL))
) STRICT;
CREATE TABLE ledger_events (
  event_id INTEGER PRIMARY KEY,
  authorization_ref_hash TEXT NOT NULL REFERENCES authorizations(authorization_ref_hash),
  event_type TEXT NOT NULL CHECK(event_type IN ('ISSUED','CONSUMED','REVOKED','EXPIRED','INVALIDATED_RESTART')),
  generation TEXT NOT NULL CHECK(length(generation)=32),
  event_at_ms INTEGER NOT NULL CHECK(event_at_ms>=0)
) STRICT;
CREATE INDEX idx_authorizations_generation_state ON authorizations(generation,state);
CREATE INDEX idx_events_authorization ON ledger_events(authorization_ref_hash,event_id);
`;
// SQLite stores the original CREATE SQL without the trailing semicolon.
// The strict comparison is intentionally fail-closed for any unexpected drift.
const EXPECTED_SCHEMA = Object.freeze(
  [...SCHEMA.matchAll(/CREATE (?:TABLE|INDEX) [\s\S]*?;/g)]
    .map(([statement]) => ({
      name: /^CREATE (?:TABLE|INDEX) ([A-Za-z_][A-Za-z_0-9]*)/.exec(statement)[1],
      sql: statement.slice(0, -1),
    }))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
);

// This is a self-contained, non-operational test handle, not an authority.
const handles = new WeakSet();
class SimulatedLedger {
  #db;
  #generation;
  #fault;
  #closed = false;
  constructor(db, generation, fault) {
    this.#db = db;
    this.#generation = generation;
    this.#fault = fault;
    handles.add(this);
  }
  get generation() { return this.#generation; }
  get closed() { return this.#closed; }
  close() {
    if (!this.#closed) {
      this.#closed = true;
      try { this.#db.close(); } catch { /* an unusable handle is still closed */ }
    }
    return positive('SIMULATED_CLOSED');
  }
  #fail(point) { if (this.#fault) this.#fault(point); }
  #ensureHealthy(expectedGeneration) {
    requireValid(!this.#closed, 'LEDGER_UNAVAILABLE');
    const row = this.#db.prepare('SELECT generation, health, last_observed_wall_ms FROM ledger_meta WHERE id=1').get();
    requireValid(row && row.health === 'HEALTHY', 'LEDGER_UNAVAILABLE');
    requireValid(row.generation === this.#generation && row.generation === expectedGeneration, 'GENERATION_MISMATCH');
    return row;
  }
  #quarantine() {
    if (this.#closed) return;
    try {
      if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      this.#db.exec('BEGIN IMMEDIATE');
      this.#db.prepare("UPDATE ledger_meta SET health='QUARANTINED' WHERE id=1").run();
      this.#db.exec('COMMIT');
    } catch { try { if (this.#db.isTransaction) this.#db.exec('ROLLBACK'); } catch {} }
    this.close();
  }
  execute({ nowMs, expectedGeneration, testStage, action }) {
    try {
      requireValid(safeMs(nowMs), 'INVALID_INPUT');
      this.#fail('F01_BEFORE_BEGIN');
      this.#db.exec('BEGIN IMMEDIATE');
      try {
        this.#fail('F02_AFTER_BEGIN');
        const row = this.#ensureHealthy(expectedGeneration);
        requireValid(nowMs >= safeNumber(row.last_observed_wall_ms), 'CLOCK_UNTRUSTED');
        const outcome = action(this.#db, (point) => this.#fail(point));
        // Clock watermark shares the authorization/event transaction.
        this.#db.prepare('UPDATE ledger_meta SET last_observed_wall_ms=? WHERE id=1').run(nowMs);
        this.#fail('F04_BEFORE_COMMIT');
        try { this.#fail('F05_COMMIT_ATTEMPT'); this.#db.exec('COMMIT'); }
        catch (error) { throw new LogicBlock('COMMIT_UNCERTAIN'); }
        this.#fail('F06_AFTER_COMMIT');
        return outcome;
      } catch (error) {
        if (error instanceof LogicBlock && error.code !== 'COMMIT_UNCERTAIN') {
          if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
          return blocked(error.code);
        }
        throw error;
      }
    } catch (error) {
      const code = error instanceof LogicBlock ? error.code
        : (String(error?.code || '').includes('BUSY') || String(error?.message || '').includes('SQLITE_BUSY')) ? 'LEDGER_BUSY'
        : testStage === 'COMMIT' || String(error?.message || '').includes('COMMIT') ? 'COMMIT_UNCERTAIN'
        : 'LEDGER_UNAVAILABLE';
      // A failed attempt is never a successful authorization. Local quarantine
      // is strict, persistent quarantine best-effort (power loss is HOST).
      this.#quarantine();
      return blocked(code);
    }
  }
}
function asHandle(value) { return handles.has(value) ? value : null; }
function publicCall(handle, input, action) {
  if (!asHandle(handle) || !hasExactly(input, ['authorizationRef', 'binding', 'nowMs'])) return blocked('INVALID_INPUT');
  try {
    const context = bindingHash(input.binding, handle.generation);
    requireValid(typeof input.authorizationRef === 'string' && HASH.test(input.authorizationRef), 'INVALID_INPUT');
    return handle.execute({ nowMs: input.nowMs, expectedGeneration: handle.generation, action: (db, fault) =>
      action(db, input, context, fault) });
  } catch (error) { return blocked(error instanceof LogicBlock ? error.code : 'INVALID_INPUT'); }
}
function markExpired(db, row, nowMs) {
  const result = db.prepare("UPDATE authorizations SET state='EXPIRED',terminal_at_ms=? WHERE authorization_ref_hash=? AND state='AUTHORIZED'")
    .run(nowMs, row.authorization_ref_hash);
  requireValid(result.changes === 1 || result.changes === 1n, 'TRANSITION_CONFLICT');
  db.prepare('INSERT INTO ledger_events(authorization_ref_hash,event_type,generation,event_at_ms) VALUES(?,?,?,?)')
    .run(row.authorization_ref_hash, 'EXPIRED', row.generation, nowMs);
}
function event(db, hash, type, generation, ms) {
  db.prepare('INSERT INTO ledger_events(authorization_ref_hash,event_type,generation,event_at_ms) VALUES(?,?,?,?)')
    .run(hash, type, generation, ms);
}
function transition(db, input, context, fault, terminal) {
  const refHash = sha('zaping-logic-268-auth-ref-v1', input.authorizationRef);
  const row = db.prepare('SELECT * FROM authorizations WHERE authorization_ref_hash=?').get(refHash);
  requireValid(row && row.context_binding_hash === context, 'INVALID_BINDING');
  requireValid(row.purpose === LOGIC_LEDGER_CONTRACT.purpose, 'PURPOSE_MISMATCH');
  if (row.state !== 'AUTHORIZED') {
    const codes = { CONSUMED: 'ALREADY_CONSUMED', REVOKED: 'REVOKED', EXPIRED: 'EXPIRED', INVALIDATED_RESTART: 'INVALIDATED_RESTART' };
    throw new LogicBlock(codes[row.state] || 'LEDGER_CORRUPT');
  }
  if (input.nowMs >= safeNumber(row.expires_at_ms)) {
    markExpired(db, row, input.nowMs);
    return blocked('EXPIRED');
  }
  const result = db.prepare(`UPDATE authorizations SET state=?, terminal_at_ms=? WHERE authorization_ref_hash=? AND generation=? AND state='AUTHORIZED' AND expires_at_ms>?`)
    .run(terminal, input.nowMs, refHash, row.generation, input.nowMs);
  requireValid(result.changes === 1 || result.changes === 1n, 'TRANSITION_CONFLICT');
  fault('F03_AFTER_UPDATE');
  event(db, refHash, terminal, row.generation, input.nowMs);
  return positive(terminal === 'CONSUMED' ? 'SIMULATED_CONSUMED' : 'SIMULATED_REVOKED');
}

export function createNewTestLedgerV1({ filePath, nowMs, testFault } = {}) {
  let db;
  try {
    validateRuntime();
    requireValid(safeMs(nowMs), 'INVALID_INPUT');
    const file = fixturePath(filePath, true);
    db = openSqlite(file, true);
    const generation = randomBytes(16).toString('hex');
    db.exec('BEGIN IMMEDIATE');
    db.exec(SCHEMA);
    db.prepare('INSERT INTO ledger_meta(id,schema_version,generation,last_observed_wall_ms,health) VALUES(1,1,?,?,?)')
      .run(generation, nowMs, 'HEALTHY');
    db.exec('PRAGMA user_version=1');
    db.exec('COMMIT');
    verifySqlite(db);
    const ledger = new SimulatedLedger(db, generation, testFault);
    return positive('SIMULATED_CREATED', { generation, ledger, sqliteVersion: process.versions.sqlite });
  } catch (error) {
    try { if (db?.isTransaction) db.exec('ROLLBACK'); db?.close(); } catch {}
    return blocked(error instanceof LogicBlock ? error.code : 'LEDGER_UNAVAILABLE');
  }
}
export function attachExistingTestLedgerV1({ filePath, expectedGeneration, testFault } = {}) {
  let db;
  try {
    validateRuntime();
    requireValid(typeof expectedGeneration === 'string' && /^[0-9a-f]{32}$/.test(expectedGeneration), 'INVALID_INPUT');
    db = openSqlite(fixturePath(filePath, false), false);
    const meta = verifySqlite(db);
    requireValid(meta.health === 'HEALTHY', 'LEDGER_UNAVAILABLE');
    requireValid(meta.generation === expectedGeneration, 'GENERATION_MISMATCH');
    const ledger = new SimulatedLedger(db, expectedGeneration, testFault);
    return positive('SIMULATED_ATTACHED', { generation: expectedGeneration, ledger, sqliteVersion: process.versions.sqlite });
  } catch (error) {
    try { db?.close(); } catch {}
    return blocked(error instanceof LogicBlock ? error.code : 'LEDGER_CORRUPT');
  }
}
export function simulateServiceRestartV1({ filePath, nowMs, testFault } = {}) {
  let db;
  try {
    validateRuntime();
    requireValid(safeMs(nowMs), 'INVALID_INPUT');
    db = openSqlite(fixturePath(filePath, false), false);
    const meta = verifySqlite(db);
    requireValid(nowMs >= safeNumber(meta.last_observed_wall_ms), 'CLOCK_UNTRUSTED');
    // Test-only scheduling hook: another connection may commit between a
    // preliminary inspection and the write lock; never trust a stale read.
    if (testFault) testFault('RESTART_BEFORE_BEGIN');
    db.exec('BEGIN IMMEDIATE');
    const lockedMeta = db.prepare('SELECT generation, health, last_observed_wall_ms FROM ledger_meta WHERE id=1').get();
    requireValid(lockedMeta && ['HEALTHY', 'QUARANTINED'].includes(lockedMeta.health), 'LEDGER_CORRUPT');
    requireValid(lockedMeta.generation === meta.generation, 'GENERATION_MISMATCH');
    requireValid(nowMs >= safeNumber(lockedMeta.last_observed_wall_ms), 'CLOCK_UNTRUSTED');
    const active = db.prepare("SELECT authorization_ref_hash,generation FROM authorizations WHERE state='AUTHORIZED'").all();
    for (const row of active) {
      const r = db.prepare("UPDATE authorizations SET state='INVALIDATED_RESTART',terminal_at_ms=? WHERE authorization_ref_hash=? AND state='AUTHORIZED'")
        .run(nowMs, row.authorization_ref_hash);
      requireValid(r.changes === 1 || r.changes === 1n, 'TRANSITION_CONFLICT');
      event(db, row.authorization_ref_hash, 'INVALIDATED_RESTART', row.generation, nowMs);
    }
    const generation = randomBytes(16).toString('hex');
    db.prepare("UPDATE ledger_meta SET generation=?,last_observed_wall_ms=?,health='HEALTHY' WHERE id=1")
      .run(generation, nowMs);
    db.exec('COMMIT');
    const ledger = new SimulatedLedger(db, generation, testFault);
    return positive('SIMULATED_RESTARTED', { generation, ledger, invalidatedCount: active.length });
  } catch (error) {
    try { if (db?.isTransaction) db.exec('ROLLBACK'); db?.close(); } catch {}
    return blocked(error instanceof LogicBlock ? error.code : 'COMMIT_UNCERTAIN');
  }
}
export function simulateIssueV1(handle, input) {
  if (!asHandle(handle) || !hasExactly(input, ['confirmationRef', 'binding', 'nowMs'])) return blocked('INVALID_INPUT');
  try {
    const binding = bindingHash(input.binding, handle.generation);
    requireValid(typeof input.confirmationRef === 'string' && CONFIRMATION.test(input.confirmationRef), 'INVALID_INPUT');
    requireValid(safeMs(input.nowMs), 'INVALID_INPUT');
    const confHash = sha('zaping-logic-268-confirmation-v1', input.confirmationRef);
    const authRef = randomBytes(32).toString('hex');
    const refHash = sha('zaping-logic-268-auth-ref-v1', authRef);
    const result = handle.execute({ nowMs: input.nowMs, expectedGeneration: handle.generation,
      action: (db, fault) => {
        const prior = db.prepare('SELECT 1 FROM authorizations WHERE confirmation_ref_hash=?').get(confHash);
        requireValid(!prior, 'DUPLICATE_CONFIRMATION');
        db.prepare(`INSERT INTO authorizations (authorization_ref_hash,confirmation_ref_hash,context_binding_hash,purpose,generation,state,created_at_ms,expires_at_ms,terminal_at_ms)
          VALUES(?,?,?,?,?,'AUTHORIZED',?,?,NULL)`)
          .run(refHash, confHash, binding, LOGIC_LEDGER_CONTRACT.purpose, handle.generation,
            input.nowMs, input.nowMs + LOGIC_LEDGER_CONTRACT.ttlMs);
        fault('F03_AFTER_UPDATE');
        event(db, refHash, 'ISSUED', handle.generation, input.nowMs);
        return positive('SIMULATED_ISSUED', { authorizationRef: authRef, generation: handle.generation });
      } });
    return result;
  } catch (error) { return blocked(error instanceof LogicBlock ? error.code : 'INVALID_INPUT'); }
}
export function simulateConsumeV1(handle, input) {
  return publicCall(handle, input, (db, value, context, fault) => transition(db, value, context, fault, 'CONSUMED'));
}
export function simulateRevokeV1(handle, input) {
  return publicCall(handle, input, (db, value, context, fault) => transition(db, value, context, fault, 'REVOKED'));
}
export function simulateReadStatusV1(handle, input) {
  return publicCall(handle, input, (db, value, context) => {
    const refHash = sha('zaping-logic-268-auth-ref-v1', value.authorizationRef);
    const row = db.prepare('SELECT * FROM authorizations WHERE authorization_ref_hash=?').get(refHash);
    requireValid(row && row.context_binding_hash === context && STATES.has(row.state), 'INVALID_BINDING');
    if (row.state === 'AUTHORIZED' && value.nowMs >= safeNumber(row.expires_at_ms)) {
      markExpired(db, row, value.nowMs);
      return positive('SIMULATED_STATUS', { simulatedState: 'EXPIRED' });
    }
    return positive('SIMULATED_STATUS', { simulatedState: row.state });
  });
}
