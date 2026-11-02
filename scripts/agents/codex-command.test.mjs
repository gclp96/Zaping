import test from 'node:test';
import assert from 'node:assert/strict';
import { codexExecArgs } from './codex-command.mjs';

test('Windows CLI sets MXC while preserving workspace sandbox and JSONL', () => {
  assert.deepEqual(codexExecArgs({ platform: 'win32' }), [
    '--ask-for-approval', 'never',
    '-c', 'windows.sandbox=mxc',
    'exec', '--sandbox', 'workspace-write', '--json', '-',
  ]);
});

test('Other platforms do not force Windows MXC', () => {
  assert.deepEqual(codexExecArgs({ platform: 'linux' }), [
    '--ask-for-approval', 'never',
    'exec', '--sandbox', 'workspace-write', '--json', '-',
  ]);
});

test('No broad filesystem bypass or full-access flags in any platform', () => {
  for (const platform of ['win32', 'linux']) {
    const argv = codexExecArgs({ platform });
    assert.equal(argv.includes('--dangerously-bypass-approvals-and-sandbox'), false);
    assert.equal(argv.includes('danger-full-access'), false);
    assert.ok(argv.includes('workspace-write'));
    assert.equal(argv.at(-1), '-');
  }
});
