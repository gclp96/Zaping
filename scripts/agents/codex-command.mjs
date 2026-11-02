/** Build a fail-closed Codex CLI argv. Keep Windows MXC native isolation. */
export function codexExecArgs({ platform = process.platform } = {}) {
  const args = ['--ask-for-approval', 'never'];
  // Windows: MXC uses bounded native isolation and avoids the unsupported
  // unelevated restricted-token split-writable-root policy.
  if (platform === 'win32') args.push('-c', 'windows.sandbox=mxc');
  return [...args, 'exec', '--sandbox', 'workspace-write', '--json', '-'];
}
