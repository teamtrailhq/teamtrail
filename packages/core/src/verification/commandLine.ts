/** An argument that reads the same written plainly: no whitespace, no quote, nothing the diff reads as structure. */
const PLAIN = /^[^\s"'`\\→]+$/;

/**
 * A command's argv as a person reads it, still exact and unambiguous: `npm run check` when every argument is plain,
 * else the argv as JSON (`["sh","-c","a b"]`). A plain line never holds a `"` and JSON always does, so the two can't
 * be mistaken for each other, and nothing is ever re-quoted the way a shell would read it.
 */
export function commandLine(argv: readonly string[]): string {
  return argv.length > 0 && argv.every((arg) => PLAIN.test(arg)) ? argv.join(' ') : JSON.stringify(argv);
}
