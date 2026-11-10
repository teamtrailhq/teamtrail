/**
 * The last line of defence of a long-running server (`teamtrail`, `teamtrail mcp --http`): an error nothing
 * caught is written to stderr and the process goes on serving. The Lookout, the reconciler, the lease reaper
 * and every remote agent's session live in this one process; none of them should end because one request, one
 * timer or one promise failed. Returns the function that removes the handlers.
 */
export function keepServing(log: (line: string) => void = (line) => void process.stderr.write(line)) {
  const report = (kind: string) => (err: unknown) => {
    const text = err instanceof Error ? (err.stack ?? err.message) : String(err);
    log(`  ${kind} (still serving): ${text}\n`);
  };
  const onException = report('Uncaught error');
  const onRejection = report('Unhandled rejection');
  process.on('uncaughtException', onException);
  process.on('unhandledRejection', onRejection);
  return () => {
    process.off('uncaughtException', onException);
    process.off('unhandledRejection', onRejection);
  };
}
