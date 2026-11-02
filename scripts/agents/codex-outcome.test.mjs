import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCodexExecution } from './codex-outcome.mjs';

const completed = [
  '{"type":"thread.started","thread_id":"test"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"type":"agent_message","text":"Prueba agregada"}}',
  '{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":40}}',
].join('\n');

test('solo entrega para revisión con turno completo y cambios', () => {
  const x = evaluateCodexExecution({exitCode:0,stdout:completed,changed:true});
  assert.equal(x.ok,true);
  assert.equal(x.classification,'LOCAL_REVIEW');
  assert.equal(x.finalMessage,'Prueba agregada');
});
test('no considera éxito un turno sin cambios (regresión del piloto Windows)', () => {
  const x = evaluateCodexExecution({exitCode:0,stdout:completed,changed:false});
  assert.equal(x.ok,false);
  assert.match(x.reasons.join(' '),/no dejó cambios/);
});
test('rechaza turno fallido incluso con exit code 0', () => {
  const x=evaluateCodexExecution({exitCode:0,stdout:'{"type":"turn.failed","error":{"message":"sandbox no disponible"}}',changed:false});
  assert.equal(x.ok,false);
  assert.match(x.reasons.join(' '),/sandbox no disponible/);
});
test('rechaza mensaje de fallo seguido de turn.completed', () => {
  const x=evaluateCodexExecution({exitCode:0,stdout:'{"type":"error","message":"sandbox bloqueado"}\n{"type":"turn.completed"}',changed:true});
  assert.equal(x.ok,false);
});
test('rechaza salida incompleta, aun si el proceso sale con 0', () => {
  const x=evaluateCodexExecution({exitCode:0,stdout:'{"type":"thread.started"}',changed:true});
  assert.equal(x.ok,false);
  assert.match(x.reasons.join(' '),/turn.completed/);
});
test('rechaza stderr implícito por código no cero', () => {
  const x=evaluateCodexExecution({exitCode:1,stdout:completed,changed:true});
  assert.equal(x.ok,false);
});
test('rechaza JSONL truncado, aunque exista evento terminal', () => {
  const x=evaluateCodexExecution({exitCode:0,stdout:completed+'\n{"type":',changed:true});
  assert.equal(x.ok,false);
});
