/** Real dispatcher preflight: injected processes ensure no network, Git writes or Codex. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { main, writePrivatePrompt } from './run-task.mjs';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approvalFingerprint } from './issue-context.mjs';
const body = ['Tipo de cambio', 'Objetivo', 'Alcance permitido', 'Fuera de alcance', 'Criterios de aceptación', 'Validaciones esperadas', 'Dependencias y riesgos']
  .map((heading) => '### ' + heading + '\n' + (heading === 'Tipo de cambio' ? 'B — Funcionalidad' : 'Prueba')).join('\n');
const primary = {number:240, title:'Prueba', body, state:'OPEN', url:'https://github.com/gclp96/zaping/issues/240', labels:['agent:ready']};
const ref = {number:222, title:'Diseño', body:'Contexto', state:'CLOSED', url:'https://github.com/gclp96/zaping/issues/222'};
test('preflight blocks before any Git/worktree/Codex call', () => {
  const withRef = {...primary, body: body + '\n### Referencias de contexto aprobadas\nissue:#222'};
  const reviewed = approvalFingerprint(withRef, [ref]);
  for (const [ticket, reference, sha] of [
    [withRef, {...ref, body:'Modificado'}, reviewed],
    [{...withRef, title:'Editado'}, ref, reviewed],
    [withRef, {...ref, url:ref.url + '/other'}, reviewed],
    [withRef, null, reviewed],
    [{...withRef, body:withRef.body + '\nissue:240'}, ref, reviewed],
    [primary, ref, '0'.repeat(64)],
    [primary, ref, 'invalid'],
  ]) {
    const calls = [];
    assert.throws(() => main(['--issue','240','--execute','--approval-sha',sha], (binary, args) => {
      calls.push(binary);
      assert.match(binary, /^gh(?:.exe)?$/);
      if (args[2] !== '240' && !reference) return {status:1, stderr:'PRIVATE'};
      return {status:0, stdout:JSON.stringify(args[2] === '240' ? ticket : reference)};
    }));
    assert.ok(calls.every((binary) => /^gh(?:.exe)?$/.test(binary)));
  }
});
test('preview renders exact original and context plus bound fingerprint without mutations', () => {
  const ticket = {...primary, body:body + '\n### Referencias de contexto aprobadas\nissue:222'};
  const write = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk) => { output += chunk; return true; };
  try {
    main(['--issue','240'], (binary, args) => {
      assert.match(binary, /^gh(?:.exe)?$/);
      return {status:0, stdout:JSON.stringify(args[2] === '240' ? ticket : ref)};
    });
  } finally { process.stdout.write = write; }
  assert.ok(output.includes(JSON.stringify(ticket)));
  assert.ok(output.includes(JSON.stringify(ref)));
  assert.ok(output.includes(approvalFingerprint(ticket, [ref])));
});

// Context snapshots must not become world-readable in /tmp (typical umask 022).
test('approved prompt is private and cannot overwrite an existing file', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'agent04a-private-prompt-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'prompt.txt');
  writePrivatePrompt(path, 'Approved issue #240 and context #222\n');
  assert.equal(readFileSync(path, 'utf8'), 'Approved issue #240 and context #222\n');
  if (process.platform !== 'win32') {
    assert.equal(statSync(path).mode & 0o777, 0o600);
  }
  assert.throws(() => writePrivatePrompt(path, 'overwritten'), { code: 'EEXIST' });
});


test('stabilization freeze prevents agent execution before any external process', () => {
  let externalCalls = 0;
  assert.throws(() => main(['--issue', '240', '--execute', '--approval-sha', 'a'.repeat(64)], () => {
    externalCalls += 1;
    throw new Error('no external process may run');
  }), /ZAPING_STABILIZATION_FREEZE/);
  assert.equal(externalCalls, 0);
});
