/**
 * #268 TEST-ONLY child process. Not an authorization CLI or staging endpoint.
 * The parent node:test harness starts it with an explicit process.execPath and
 * temporary SQLite fixture; no shell, Git, network, LLM, or real credentials.
 */
import { DatabaseSync } from 'node:sqlite';
import { attachExistingTestLedgerV1, simulateConsumeV1, simulateRevokeV1 } from './synthetic-authorization-ledger.mjs';

if (process.env.ZAPING_LOGIC_268_WORKER_TEST !== '1') {
  process.exitCode = 2;
  process.stderr.write('TEST_ONLY\n');
} else {
  const [mode, filePath, generation, authorizationRef, timestamp, bindingBase64] = process.argv.slice(2);
  const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
  const nowMs = Number(timestamp);
  if (!['consume', 'revoke', 'hold'].includes(mode)
    || typeof filePath !== 'string' || !Number.isSafeInteger(nowMs)) {
    emit({ type: 'ERROR', code: 'INVALID_TEST_ARGS' });
    process.exitCode = 2;
  } else if (mode === 'hold') {
    // This is a deterministic test fixture for SQLITE_BUSY. The raw connection
    // exists in this TEST worker only, never in the ledger's public API.
    let db;
    try {
      const opened = attachExistingTestLedgerV1({ filePath, expectedGeneration: generation });
      if (opened.status !== 'SIMULATED_ATTACHED') throw Error(opened.code);
      opened.ledger.close();
      db = new DatabaseSync(filePath, { timeout: 250, defensive: true });
      db.exec('BEGIN IMMEDIATE');
      emit({ type: 'READY', pid: process.pid });
      setTimeout(() => {
        try { db.exec('ROLLBACK'); emit({ type: 'RELEASED', pid: process.pid }); }
        catch { emit({ type: 'ERROR', code: 'RELEASE_FAILED' }); process.exitCode = 2; }
        finally { db?.close(); }
      }, 850);
    } catch {
      emit({ type: 'ERROR', code: 'HOLD_FAILED' });
      try { db?.close(); } catch {}
      process.exitCode = 2;
    }
  } else {
    try {
      const binding = JSON.parse(Buffer.from(bindingBase64, 'base64url').toString('utf8'));
      const opened = attachExistingTestLedgerV1({ filePath, expectedGeneration: generation });
      if (opened.status !== 'SIMULATED_ATTACHED') {
        emit({ type: 'RESULT', pid: process.pid, result: opened });
        process.exitCode = 1;
      } else {
        emit({ type: 'READY', pid: process.pid });
        let started = false;
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => {
          if (started || !chunk.includes('GO')) return;
          started = true;
          const input = { authorizationRef, binding, nowMs };
          const result = mode === 'consume' ? simulateConsumeV1(opened.ledger, input)
            : simulateRevokeV1(opened.ledger, input);
          emit({ type: 'RESULT', pid: process.pid, result });
          opened.ledger.close();
          process.stdin.pause();
        });
        process.stdin.on('end', () => {
          if (!started) { opened.ledger.close(); process.exitCode = 2; }
        });
        process.stdin.resume();
      }
    } catch {
      emit({ type: 'RESULT', pid: process.pid, result: { status: 'BLOCKED', code: 'INVALID_TEST_ARGS', simulationOnly: true, stagePermission: false } });
      process.exitCode = 2;
    }
  }
}
