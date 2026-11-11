/**
 * The program that opens http links on this machine, found explicitly so a one-time sign-in page goes to a browser,
 * never to whatever opens `.html` files (an editor, whose buffer an in-editor assistant reads). `command` is the
 * argv that opens a file in it, run without a shell. `none`: no browser found, or one that can't read the page.
 */
export type HttpHandler =
  { kind: 'app'; name: string; command: (file: string) => [string, string[]] } | { kind: 'none'; why: string };

/** What finding the handler reads, injectable for tests. */
export interface HandlerDeps {
  /** Runs a program without a shell and returns its stdout; throws when it fails. */
  run: (cmd: string, args: string[]) => string;
  env: NodeJS.ProcessEnv;
  /** A file's text, or undefined when it can't be read. */
  readFile: (file: string) => string | undefined;
  home: string;
}
