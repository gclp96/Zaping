/** Build Codex CLI argv without mixing global flags into the exec subcommand. */
export function codexExecArgs() {
  // --ask-for-approval belongs before "exec" for Codex CLI 0.166 and compatible versions.
  // Keep the sandbox: this does not enable unrestricted filesystem or network access.
  return ['--ask-for-approval', 'never', 'exec', '--sandbox', 'workspace-write', '-'];
}
