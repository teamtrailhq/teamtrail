/** Errors in a minute past which the process is in a bad state for good: it stops, and a restart recovers. */
const MAX_PER_MINUTE = 10;

export interface KeepServingOptions {
  log?: (line: string) => void;
  exit?: (code: number) => void;
  now?: () => number;
  /** Install the process handlers (default); tests report errors by hand. */
  handlers?: boolean;
}

/**
 * The last line of defence of a long-running server (`teamtrail`, `teamtrail mcp --http`): an error nothing
 * caught is written to stderr with its stack, and the process goes on serving. The Lookout, the reconciler, the
 * lease reaper and every remote agent's session live in this one process; none of them should end because one
 * request, one timer or one promise failed. But errors that keep coming mean it is no longer in a state it can
 * serve from: past ten in a minute it says so and exits, so whatever restarts it starts clean. Returns the
 * function that removes the handlers, with `report` for an error to count.
 */
export function keepServing(o: KeepServingOptions = {}) {
  const log = o.log ?? ((line: string) => void process.stderr.write(line));
  const exit = o.exit ?? ((code: number) => process.exit(code));
  const now = o.now ?? Date.now;
  let recent: number[] = [];
  let stopping = false;
  const report = (err: unknown, kind = 'Uncaught error') => {
    const text = err instanceof Error ? (err.stack ?? err.message) : String(err);
    log(`  ${kind} (still serving): ${text}\n`);
    recent = [...recent.filter((at) => now() - at < 60_000), now()];
    if (stopping || recent.length < MAX_PER_MINUTE) return;
    stopping = true;
    log(`\n  ${recent.length} errors in a minute: this process is in a bad state, stopping so a restart recovers.\n`);
    exit(1);
  };
  const onException = (err: unknown) => report(err, 'Uncaught error');
  const onRejection = (err: unknown) => report(err, 'Unhandled rejection');
  if (o.handlers !== false) {
    process.on('uncaughtException', onException);
    process.on('unhandledRejection', onRejection);
  }
  const stop = () => {
    process.off('uncaughtException', onException);
    process.off('unhandledRejection', onRejection);
  };
  return Object.assign(stop, { report });
}
