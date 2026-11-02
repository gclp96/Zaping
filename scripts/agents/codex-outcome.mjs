/** Evaluate a single Codex CLI --json invocation; fail closed on incomplete/failed turns. */
export function evaluateCodexExecution({ exitCode, stdout = '', changed = false }) {
  let completed = false;
  let failed = false;
  let fatal = null;
  let finalMessage = '';
  let events = 0;
  let invalidLines = 0;
  const text = typeof stdout === 'string' ? stdout : '';

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      invalidLines++;
      continue;
    }
    if (!event || typeof event.type !== 'string') {
      invalidLines++;
      continue;
    }
    events++;
    if (event.type === 'turn.completed') {
      completed = true;
    } else if (event.type === 'turn.failed') {
      failed = true;
      fatal = event.error?.message ?? 'Codex reportó turn.failed';
    } else if (event.type === 'error') {
      failed = true;
      fatal = event.message ?? 'Codex reportó un error';
    } else if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      finalMessage = String(event.item.text ?? '');
    }
  }

  const reasons = [];
  if (exitCode !== 0) reasons.push(`El proceso Codex finalizó con código ${exitCode ?? 'desconocido'}`);
  if (failed) reasons.push(fatal ?? 'Codex reportó un fallo');
  if (!completed) reasons.push('Falta evento terminal turn.completed');
  if (invalidLines > 0) reasons.push(`Salida JSONL mal formada: ${invalidLines} líneas`);
  if (!changed) reasons.push('Codex no dejó cambios versionables ni archivos nuevos');
  return {
    ok: reasons.length === 0,
    reasons,
    events,
    finalMessage,
    classification: reasons.length ? 'BLOCKED_OR_INCOMPLETE' : 'LOCAL_REVIEW',
  };
}
