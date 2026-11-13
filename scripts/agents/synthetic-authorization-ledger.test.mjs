import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  LOGIC_LEDGER_CONTRACT, createNewTestLedgerV1, attachExistingTestLedgerV1,
  simulateServiceRestartV1, simulateIssueV1, simulateConsumeV1,
  simulateRevokeV1, simulateReadStatusV1,
} from './synthetic-authorization-ledger.mjs';

const T0 = 1_800_000_000_000;
const worker = join(dirname(fileURLToPath(import.meta.url)), 'synthetic-authorization-ledger-worker.mjs');
const sha = value => createHash('sha256').update(value).digest('hex');
const binding = (overrides = {}) => ({
  repository: 'gclp96/zaping', issueNumber: 268,
  approvedIssueSha256: 'a'.repeat(64), scopeSha256: 'b'.repeat(64),
  expectedBaseSha: 'c6ffc331c5e776e04f78e68aa2025aa362a8fa92',
  packageSha256: 'c'.repeat(64), profile: 'LOGIC_TEST',
  purpose: 'SYNTHETIC_TEST_ONLY', ...overrides,
});
let nextId = 0;
const confirmation = () => `SYNTHETIC-CONFIRM-${String(++nextId).padStart(10, '0')}`;
function fixture(t, { testFault } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'zaping-logic-268-'));
  const filePath = join(directory, 'ledger.sqlite');
  const handles = [];
  t.after(() => {
    for (const handle of handles) handle?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const opened = createNewTestLedgerV1({ filePath, nowMs: T0, testFault });
  assert.equal(opened.status, 'SIMULATED_CREATED', JSON.stringify(opened));
  handles.push(opened.ledger);
  const issue = (options = {}) => simulateIssueV1(opened.ledger, {
    nowMs: T0, confirmationRef: confirmation(), binding: binding(), ...options,
  });
  return { filePath, directory, opened, handles, issue,
    attach: (generation = opened.generation, extra = {}) => {
      const r = attachExistingTestLedgerV1({ filePath, expectedGeneration: generation, ...extra });
      if (r.ledger) handles.push(r.ledger);
      return r;
    },
    restart: (nowMs = T0 + 1) => {
      const r = simulateServiceRestartV1({ filePath, nowMs });
      if (r.ledger) handles.push(r.ledger);
      return r;
    },
  };
}
function raw(filePath, fn) {
  const db = new DatabaseSync(filePath, { readBigInts: true });
  try { return fn(db); } finally { db.close(); }
}
function count(filePath, table) {
  assert.ok(['authorizations', 'ledger_events'].includes(table));
  return Number(raw(filePath, db => db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n));
}
function record(filePath) {
  return raw(filePath, db => db.prepare('SELECT state,generation,terminal_at_ms FROM authorizations LIMIT 1').get());
}
function command(authorizationRef, nowMs = T0 + 1, custom = binding()) {
  return { authorizationRef, binding: custom, nowMs };
}
function assertion(result) {
  assert.equal(result.simulationOnly, true);
  assert.equal(result.stagePermission, false);
  assert.notEqual(result.status, 'APPROVED');
}
function spawnWorker(mode, fx, ref, at = T0 + 1) {
  const args = [worker, mode, fx.filePath, fx.opened.generation,
    ref || '0'.repeat(64), String(at), Buffer.from(JSON.stringify(binding())).toString('base64url')];
  const p = spawn(process.execPath, args, {
    shell: false, windowsHide: true, env: { ...process.env, ZAPING_LOGIC_268_WORKER_TEST: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const listeners = new Set();
  let buffer = '';
  const events = [];
  let stderr = '';
  p.stderr.setEncoding('utf8');
  p.stderr.on('data', chunk => { stderr += chunk; });
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', chunk => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n');
      const rawLine = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const parsed = JSON.parse(rawLine);
        events.push(parsed);
        for (const l of listeners) l(parsed);
      } catch { /* test fails on missing expected event */ }
    }
  });
  const ended = new Promise((resolve, reject) => {
    p.once('error', reject);
    p.once('exit', (code, signal) => resolve({ code, signal, stderr }));
  });
  function wait(type) {
    const found = events.find(e => e.type === type);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const done = e => {
        if (e.type === type) { listeners.delete(done); resolve(e); }
        if (e.type === 'ERROR') { listeners.delete(done); reject(Error(JSON.stringify(e))); }
      };
      listeners.add(done);
      ended.then(() => { listeners.delete(done); if (!events.some(e => e.type === type)) reject(Error(`Missing ${type}: ${stderr}`)); }, reject);
    });
  }
  return { p, ended, wait };
}

// All cases are synthetic. Passing them cannot mark HOST/Gate C as passed.
test('L01 — Node/SQLite baseline, schema V1, PRAGMAs and no extra tables', t => {
  assert.equal(process.version, LOGIC_LEDGER_CONTRACT.node);
  assert.equal(process.versions.sqlite, LOGIC_LEDGER_CONTRACT.sqlite);
  const f = fixture(t);
  raw(f.filePath, db => {
    assert.equal(Number(db.prepare('PRAGMA user_version').get().user_version), 1);
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(v=>v.name),
      ['authorizations', 'ledger_events', 'ledger_meta']);
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
  const v = f.attach();
  assert.equal(v.status, 'SIMULATED_ATTACHED');
  assert.equal(v.generation, f.opened.generation);
});

test('L02 — unique synthetic confirmation, tombstone after reopen', t => {
  const f = fixture(t);
  const key = confirmation();
  const first = f.issue({ confirmationRef: key });
  assert.equal(first.status, 'SIMULATED_ISSUED'); assertion(first);
  assert.equal(f.issue({ confirmationRef: key }).code, 'DUPLICATE_CONFIRMATION');
  assert.equal(f.attach().status, 'SIMULATED_ATTACHED');
  const later = f.restart();
  assert.equal(later.status, 'SIMULATED_RESTARTED');
  assert.equal(simulateIssueV1(later.ledger, { confirmationRef: key, binding: binding(), nowMs: T0+2 }).code,
    'DUPLICATE_CONFIRMATION');
  assert.equal(count(f.filePath, 'authorizations'), 1);
});

test('L03 — two distinct real PIDs consume one authorization in same generation', async t => {
  const f = fixture(t);
  const issued = f.issue();
  assert.equal(issued.status, 'SIMULATED_ISSUED');
  const workers = [spawnWorker('consume', f, issued.authorizationRef), spawnWorker('consume', f, issued.authorizationRef)];
  t.after(() => workers.forEach(w => { if (!w.p.killed) w.p.kill(); }));
  const ready = await Promise.all(workers.map(w => w.wait('READY')));
  assert.equal(new Set(ready.map(v => v.pid)).size, 2);
  workers.forEach(w => w.p.stdin.end('GO\n'));
  const results = await Promise.all(workers.map(w => w.wait('RESULT')));
  const exits = await Promise.all(workers.map(w => w.ended));
  assert.ok(exits.every(x => x.code === 0), JSON.stringify(exits));
  assert.equal(results.filter(v => v.result.status === 'SIMULATED_CONSUMED').length, 1);
  assert.equal(results.filter(v => v.result.status === 'BLOCKED').length, 1);
  results.forEach(v => assertion(v.result));
  assert.equal(record(f.filePath).state, 'CONSUMED');
  assert.equal(count(f.filePath, 'ledger_events'), 2);
});

test('L04 — real consume vs revoke race has one terminal winner', async t => {
  const f = fixture(t);
  const issued = f.issue();
  const workers = ['consume', 'revoke'].map(mode => spawnWorker(mode, f, issued.authorizationRef));
  t.after(() => workers.forEach(w => { if (!w.p.killed) w.p.kill(); }));
  await Promise.all(workers.map(w => w.wait('READY')));
  workers.forEach(w => w.p.stdin.end('GO\n'));
  const rs = await Promise.all(workers.map(w => w.wait('RESULT')));
  assert.ok((await Promise.all(workers.map(w => w.ended))).every(x => x.code === 0));
  assert.equal(rs.filter(v => ['SIMULATED_CONSUMED', 'SIMULATED_REVOKED'].includes(v.result.status)).length, 1);
  assert.equal(count(f.filePath, 'ledger_events'), 2);
  assert.ok(['CONSUMED', 'REVOKED'].includes(record(f.filePath).state));
});

test('L05 — all binding fields and purpose mismatch block', t => {
  const f = fixture(t); const issued = f.issue();
  for (const [key, replacement] of Object.entries({ repository: 'other/repo', issueNumber: 269,
    approvedIssueSha256: 'd'.repeat(64), scopeSha256: 'e'.repeat(64),
    expectedBaseSha: 'a'.repeat(40), packageSha256: 'f'.repeat(64),
    profile: 'OPERATIVE', purpose: 'REAL', })) {
    const response = simulateConsumeV1(f.opened.ledger, command(issued.authorizationRef, T0+1, binding({ [key]: replacement })));
    assert.equal(response.status, 'BLOCKED', key);
    assertion(response);
  }
  assert.equal(record(f.filePath).state, 'AUTHORIZED');
  assert.equal(simulateConsumeV1(f.opened.ledger, command(issued.authorizationRef)).status, 'SIMULATED_CONSUMED');
});

test('L06 — TTL 599999/600000, clock rollback and safe integers', t => {
  const a = fixture(t); const issuedA = a.issue();
  assert.equal(simulateConsumeV1(a.opened.ledger, command(issuedA.authorizationRef, T0+599999)).status, 'SIMULATED_CONSUMED');
  const b = fixture(t); const issuedB = b.issue();
  assert.equal(simulateConsumeV1(b.opened.ledger, command(issuedB.authorizationRef, T0+600000)).code, 'EXPIRED');
  assert.equal(record(b.filePath).state, 'EXPIRED');
  const c = fixture(t); const issuedC = c.issue();
  assert.equal(simulateReadStatusV1(c.opened.ledger, command(issuedC.authorizationRef, T0+10)).simulatedState, 'AUTHORIZED');
  assert.equal(simulateConsumeV1(c.opened.ledger, command(issuedC.authorizationRef, T0+9)).code, 'CLOCK_UNTRUSTED');
  assert.equal(simulateConsumeV1(c.opened.ledger, command(issuedC.authorizationRef, Number.MAX_SAFE_INTEGER)).status, 'BLOCKED');
  assert.equal(record(c.filePath).state, 'AUTHORIZED');
});

test('L07 — attach is not restart; restart invalidates pending and audits it', t => {
  const f = fixture(t); const issued = f.issue();
  assert.equal(f.attach().status, 'SIMULATED_ATTACHED');
  assert.equal(record(f.filePath).state, 'AUTHORIZED');
  const started = f.restart(T0+1);
  assert.equal(started.status, 'SIMULATED_RESTARTED');
  assert.equal(started.invalidatedCount, 1);
  assert.notEqual(started.generation, f.opened.generation);
  assert.equal(record(f.filePath).state, 'INVALIDATED_RESTART');
  assert.equal(count(f.filePath, 'ledger_events'), 2);
  assert.equal(simulateConsumeV1(f.opened.ledger, command(issued.authorizationRef, T0+2)).code, 'GENERATION_MISMATCH');
  assert.equal(f.attach(f.opened.generation).code, 'GENERATION_MISMATCH');
  const newIssued = simulateIssueV1(started.ledger, { confirmationRef: confirmation(), binding: binding(), nowMs: T0+2 });
  assert.equal(newIssued.status, 'SIMULATED_ISSUED');
});

test('L07 — restart rechecks the clock after acquiring its write lock', t => {
  const f = fixture(t); const issued = f.issue();
  const attempted = simulateServiceRestartV1({
    filePath: f.filePath, nowMs: T0 + 1,
    testFault: point => {
      if (point !== 'RESTART_BEFORE_BEGIN') return;
      const peer = f.attach();
      assert.equal(peer.status, 'SIMULATED_ATTACHED');
      const updated = simulateReadStatusV1(peer.ledger, command(issued.authorizationRef, T0 + 10));
      assert.equal(updated.status, 'SIMULATED_STATUS');
      peer.ledger.close();
    },
  });
  assert.equal(attempted.status, 'BLOCKED');
  assert.equal(attempted.code, 'CLOCK_UNTRUSTED');
  assert.equal(record(f.filePath).state, 'AUTHORIZED');
  assert.equal(f.restart(T0 + 11).status, 'SIMULATED_RESTARTED');
});

test('L08 / F01–F05 — failpoints never issue success; quarantine and restart', t => {
  for (const point of ['F01_BEFORE_BEGIN', 'F02_AFTER_BEGIN', 'F03_AFTER_UPDATE',
    'F04_BEFORE_COMMIT', 'F05_COMMIT_ATTEMPT']) {
    const f = fixture(t, { testFault: stage => { if (stage === point) throw Error('fixture fault'); } });
    const response = f.issue();
    assert.equal(response.status, 'BLOCKED', point); assertion(response);
    assert.equal(f.attach().status, 'BLOCKED', point);
    const recovered = f.restart(T0+1);
    assert.equal(recovered.status, 'SIMULATED_RESTARTED', point);
  }
});

test('L08 / F06 — committed consume with lost reply is not consumed twice', t => {
  const f = fixture(t); const issued = f.issue(); f.opened.ledger.close();
  const poisoned = f.attach(f.opened.generation, { testFault: point => {
    if (point === 'F06_AFTER_COMMIT') throw Error('lost response fixture');
  } });
  assert.equal(poisoned.status, 'SIMULATED_ATTACHED');
  const result = simulateConsumeV1(poisoned.ledger, command(issued.authorizationRef));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(record(f.filePath).state, 'CONSUMED');
  assert.equal(f.attach().status, 'BLOCKED');
  const restarted = f.restart(T0+2); assert.equal(restarted.status, 'SIMULATED_RESTARTED');
  assert.equal(simulateConsumeV1(restarted.ledger, command(issued.authorizationRef, T0+3)).status, 'BLOCKED');
  assert.equal(count(f.filePath, 'ledger_events'), 2);
});

test('L08 / F07 — real concurrent writer generates bounded SQLITE_BUSY', async t => {
  const f = fixture(t); const issued = f.issue();
  const holder = spawnWorker('hold', f, issued.authorizationRef);
  t.after(() => { if (!holder.p.killed) holder.p.kill(); });
  await holder.wait('READY');
  const result = simulateConsumeV1(f.opened.ledger, command(issued.authorizationRef));
  assert.equal(result.status, 'BLOCKED'); assertion(result);
  const released = await holder.wait('RELEASED'); assert.equal(typeof released.pid, 'number');
  assert.equal((await holder.ended).code, 0);
  const recovered = f.restart(T0+2);
  assert.equal(recovered.status, 'SIMULATED_RESTARTED');
});

test('L09 / F08 — missing, corrupted and incompatible schema fail closed', t => {
  const f = fixture(t); f.opened.ledger.close();
  const bad = f.attach('f'.repeat(32)); assert.equal(bad.code, 'GENERATION_MISMATCH');
  raw(f.filePath, db => db.exec('PRAGMA user_version=2'));
  assert.equal(f.attach().status, 'BLOCKED');
  const f2 = fixture(t); f2.opened.ledger.close();
  writeFileSync(f2.filePath, Buffer.from('not a sqlite database'));
  assert.equal(f2.attach().status, 'BLOCKED');
  const f3 = fixture(t); f3.opened.ledger.close();
  rmSync(f3.filePath);
  assert.equal(f3.attach().status, 'BLOCKED');
  assert.equal(existsSync(f3.filePath), false);
  const f4 = fixture(t); f4.opened.ledger.close();
  raw(f4.filePath, db => db.exec('PRAGMA journal_mode=WAL'));
  assert.equal(f4.attach().status, 'BLOCKED');
});

test('L09 — drifted CREATE SQL and unexpected triggers are rejected', t => {
  const changed = fixture(t); changed.opened.ledger.close();
  raw(changed.filePath, db => db.exec('ALTER TABLE ledger_meta ADD COLUMN extra_field TEXT'));
  assert.equal(changed.attach().status, 'BLOCKED');
  const triggered = fixture(t); triggered.opened.ledger.close();
  raw(triggered.filePath, db => db.exec('CREATE TRIGGER unexpected_after_insert AFTER INSERT ON authorizations BEGIN SELECT 1; END;'));
  assert.equal(triggered.attach().status, 'BLOCKED');
});

test('L10 — malformed inputs, replay, no plaintext confirmations in the DB', t => {
  const f = fixture(t); const key = confirmation();
  const issued = f.issue({ confirmationRef: key });
  assert.equal(issued.status, 'SIMULATED_ISSUED');
  assert.equal(simulateIssueV1(f.opened.ledger, { confirmationRef: '<script/>', binding: binding(), nowMs: T0 }).status, 'BLOCKED');
  assert.equal(simulateConsumeV1(f.opened.ledger, command(issued.authorizationRef.slice(1))).status, 'BLOCKED');
  assert.equal(simulateConsumeV1(f.opened.ledger, command(issued.authorizationRef)).status, 'SIMULATED_CONSUMED');
  assert.equal(simulateConsumeV1(f.opened.ledger, command(issued.authorizationRef)).code, 'ALREADY_CONSUMED');
  assert.equal(f.issue({ confirmationRef: key, nowMs: T0 + 1 }).code, 'DUPLICATE_CONFIRMATION');
  const bytes = readFileSync(f.filePath);
  assert.equal(bytes.includes(Buffer.from(key)), false);
  assert.equal(bytes.includes(Buffer.from(issued.authorizationRef)), false);
  assert.equal(bytes.includes(Buffer.from('a'.repeat(64))), false);
  assert.notEqual(sha(key), key);
});

test('L11 — implementation has no runner/Git/network/process-spawn imports', () => {
  const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'synthetic-authorization-ledger.mjs'), 'utf8');
  assert.doesNotMatch(text, /^import .* from 'node:(child_process|net|http|https|tls|dgram|worker_threads)'/m);
  assert.doesNotMatch(text, /\bspawnSync\s*\(|\bexecFile\s*\(|\bfetch\s*\(/);
  assert.doesNotMatch(text, /\bagent:ready['"]\s*[,)}]|\bSTAGED_SYNTHETIC_ONLY\b\s*:/);
});

test('L12 — all public result types remain simulation-only, status NOT_RUN outside tests', t => {
  const f = fixture(t); const issued = f.issue(); assertion(issued);
  const status = simulateReadStatusV1(f.opened.ledger, command(issued.authorizationRef));
  assertion(status); assert.equal(status.simulatedState, 'AUTHORIZED');
  const revoked = simulateRevokeV1(f.opened.ledger, command(issued.authorizationRef));
  assertion(revoked); assert.equal(revoked.status, 'SIMULATED_REVOKED');
  assertion(f.opened.ledger.close());
  assert.equal(simulateReadStatusV1(f.opened.ledger, command(issued.authorizationRef)).status, 'BLOCKED');
});
