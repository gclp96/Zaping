import test from 'node:test';
import assert from 'node:assert/strict';
import { codexExecArgs } from './codex-command.mjs';

test('Codex CLI approval flag precedes exec and workspace sandbox remains enabled', () => {
  assert.deepEqual(codexExecArgs(), [
    '--ask-for-approval',
    'never',
    'exec',
    '--sandbox',
    'workspace-write',
    '--json',
    '-',
  ]);
});

test('no full-access or bypass flags are allowed in the command', () => {
  const argv = codexExecArgs();
  assert.equal(argv.includes('--dangerously-bypass-approvals-and-sandbox'), false);
  assert.equal(argv.includes('danger-full-access'), false);
  assert.equal(argv.at(-1), '-');
});
