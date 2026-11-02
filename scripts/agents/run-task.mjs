#!/usr/bin/env node
/** Human-gated local dispatcher for one GitHub issue to one Codex worktree. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCodexPrompt, validateIssue } from './issue-contract.mjs';

const REPO = 'gclp96/zaping';
const repoDir = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function fail(message) { process.stderr.write(`ERROR: ${message}\n`); process.exit(1); }
function call(binary, args, opts = {}) {
  const result = spawnSync(binary, args, { cwd: repoDir, encoding: 'utf8', ...opts });
  if (result.error) fail(`${binary}: ${result.error.message}`);
  if (result.status !== 0) fail(`${binary} ${args.join(' ')}: ${(result.stderr ?? '').trim() || `exit ${result.status}`}`);
  return (result.stdout ?? '').trim();
}
function main() {
  const args = process.argv.slice(2);
  const preview = args.length === 2 && args[0] === '--issue' && /^\d+$/.test(args[1]);
  const execute = args.length === 5 && args[0] === '--issue' && /^\d+$/.test(args[1])
    && args[2] === '--execute' && args[3] === '--approval-sha' && /^[a-f0-9]{64}$/.test(args[4]);
  if (!preview && !execute) {
    fail('Uso: node scripts/agents/run-task.mjs --issue <N> [--execute --approval-sha <SHA256>]');
  }
  const number = Number(args[1]);
  if (!Number.isSafeInteger(number) || number <= 0) fail('Número de issue inválido');
  const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
  const raw = call(gh, ['issue', 'view', String(number), '--repo', REPO, '--json', 'number,title,body,labels,state,url']);
  let issue;
  try { issue = JSON.parse(raw); } catch { fail('GitHub CLI devolvió JSON inválido'); }
  if (issue.number !== number || !issue.url?.startsWith(`https://github.com/${REPO}/issues/${number}`)) {
    fail('Identidad del issue no coincide con el repositorio esperado');
  }
  const validated = validateIssue(issue);
  if (!validated.ok) fail(validated.errors.join('; '));
  const prompt = createCodexPrompt(issue, validated.sections);
  // Approval fingerprint binds the operator's reviewed title/body to this exact issue.
  const approvalSha = createHash('sha256').update(JSON.stringify([issue.number, issue.title, issue.body])).digest('hex');
  if (!execute) {
    process.stdout.write(`Issue #${number} con etiqueta agent:ready. Vista previa: NO se ha ejecutado Codex.\n\n${prompt}`);
    process.stdout.write(`\nHuella SHA-256 del ticket revisado: ${approvalSha}\n`);
    process.stdout.write(`Si estás de acuerdo con el contenido, ejecuta:\nnode scripts/agents/run-task.mjs --issue ${number} --execute --approval-sha ${approvalSha}\n`);
    return;
  }
  if (args[4] !== approvalSha) fail('El issue fue editado o la huella no corresponde; revisar y aprobar nuevamente');

  const remote = call('git', ['remote', 'get-url', 'origin']);
  if (!/^(https:\/\/github\.com\/gclp96\/zaping(?:\.git)?|git@github\.com:gclp96\/zaping(?:\.git)?)$/.test(remote)) {
    fail('El remote origin no coincide con gclp96/zaping');
  }
  const actualRepo = call('git', ['rev-parse', '--show-toplevel']);
  // Paths on Windows may differ in letter case or separator style.
  if (resolve(actualRepo).toLowerCase() !== repoDir.toLowerCase()) fail('Ejecutar desde el checkout correcto del proyecto');

  // All paths and Git ref names below are derived ONLY from a validated positive integer.
  const branch = `codex/agent-issue-${number}`;
  const runDir = join(tmpdir(), 'zaping-agent-runs', `issue-${number}`);
  if (existsSync(runDir)) fail(`Worktree existente; revísalo sin sobrescribir: ${runDir}`);
  const ref = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {cwd: repoDir});
  if (ref.status === 0) fail(`La rama ${branch} ya existe; revisar manualmente`);
  if (ref.error) fail(ref.error.message);

  const codex = process.platform === 'win32' ? 'codex.cmd' : 'codex';
  const ver = spawnSync(codex, ['--version'], { cwd: repoDir, encoding: 'utf8', shell: process.platform === 'win32' });
  if (ver.error || ver.status !== 0) fail('Codex CLI no disponible. Instálalo e inicia sesión antes de ejecutar.');

  call('git', ['fetch', '--no-tags', 'origin', 'main']);
  const rules = call('git', ['show', 'refs/remotes/origin/main:AGENTS.md']);
  if (!rules.includes('# Zaping — instrucciones para agentes de programación')) {
    fail('AGENTS.md en origin/main no contiene las guardas de Zaping (PR #193 pendiente). No ejecutar.');
  }
  const base = call('git', ['rev-parse', 'refs/remotes/origin/main']);
  mkdirSync(resolve(runDir, '..'), { recursive: true });
  call('git', ['worktree', 'add', '-b', branch, runDir, 'refs/remotes/origin/main']);
  const promptPath = join(resolve(runDir, '..'), `issue-${number}-prompt.txt`);
  // Write outside the Git worktree to avoid accidental inclusion in a commit.
  writeFileSync(promptPath, prompt, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`Issue #${number} | base ${base} | branch ${branch}\nWorktree: ${runDir}\nPrompt: ${promptPath}\n`);
  const expectedHead = call('git', ['rev-parse', 'HEAD'], { cwd: runDir });
  const start = Date.now();
  const result = spawnSync(codex, ['exec', '--sandbox', 'workspace-write', '--ask-for-approval', 'never', '-'], {
    cwd: runDir, input: prompt, encoding: 'utf8', stdio: ['pipe','inherit','inherit'],
    shell: process.platform === 'win32',
  });
  process.stdout.write(`\nDuración: ${Math.round((Date.now() - start) / 1000)} s\n`);
  const status = spawnSync('git', ['status', '--short'], {cwd: runDir, encoding: 'utf8'});
  process.stdout.write(`Estado del worktree:\n${status.stdout ?? '(no disponible)'}\n`);
  const actualHead = call('git', ['rev-parse', 'HEAD'], { cwd: runDir });
  if (actualHead !== expectedHead) fail('Codex cambió HEAD (commit/rebase/checkout). Detener y revisar manualmente; no publicar.');
  if (result.error) fail(`Error al iniciar Codex: ${result.error.message}`);
  if (result.status !== 0) fail(`Codex terminó con código ${result.status}; conservar worktree para diagnóstico`);
  process.stdout.write('Ejecución local terminada. Revisar diff y CI antes de cualquier PR/merge.\n');
}
main();
