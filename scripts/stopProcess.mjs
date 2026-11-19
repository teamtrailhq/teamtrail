/**
 * Stops a child process and resolves once it has exited. A step removes its scratch folder after this: a Lookout
 * still shutting down writes into the folder while it is removed, which fails the removal (ENOTEMPTY).
 */
export async function stopProcess(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  await new Promise((resolve) => {
    proc.once('exit', resolve);
    proc.kill('SIGTERM');
  });
}
