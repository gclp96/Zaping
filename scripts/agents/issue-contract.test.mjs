import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIssueSections, validateIssue, createCodexPrompt } from './issue-contract.mjs';

const body = `### Tipo de cambio\n\nB — Funcionalidad estándar\n\n### Objetivo\n\nAñadir validación de compra\n\n### Alcance permitido\n\napp/api/src/purchases\n\n### Fuera de alcance\n\nPrisma y producción\n\n### Criterios de aceptación\n\nTest focal aprobado\n\n### Validaciones esperadas\n\nnpm test\n\n### Dependencias y riesgos\n\nNinguno\n`;
function issue(extra = {}) { return { number: 194, state: 'OPEN', title: '[AGENT] Prueba', url: 'https://github.com/gclp96/zaping/issues/194', labels: [{name:'agent:ready'}], body, ...extra }; }

test('parsea contrato de issue form sin duplicar secciones', () => {
  const s = parseIssueSections(body);
  assert.equal(s.get('Tipo de cambio'), 'B — Funcionalidad estándar');
  assert.equal(s.size, 7);
});
test('acepta tareas B aprobadas con campos completos', () => {
  const result = validateIssue(issue());
  assert.equal(result.ok, true);
  assert.match(createCodexPrompt(issue(), result.sections), /No hagas commit, push, PR, merge ni deploy/);
});
test('rechaza sin etiqueta de aprobación', () => {
  const r = validateIssue(issue({labels:[]}));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /agent:ready/);
});
test('rechaza cambios críticos tipo C', () => {
  const r = validateIssue(issue({body:body.replace('B — Funcionalidad estándar','C — Crítico \/ arquitectónico')}));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /tipo A\/B/);
});
test('rechaza campos obligatorios sin contenido', () => {
  const r = validateIssue(issue({body:body.replace('npm test', '_No response_')}));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /Validaciones esperadas/);
});
test('rechaza issue cerrado', () => assert.equal(validateIssue(issue({state:'CLOSED'})).ok, false));
