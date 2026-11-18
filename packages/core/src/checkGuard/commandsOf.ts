/** Words between these end one command and start the next. */
const SEPARATORS = new Set(['&&', '||', ';', '|', '&', '\n']);
/** A variable assignment before the program (`NODE_ENV=test vitest`). */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** Programs that run the command after them: the guard reads through them. */
const WRAPPERS = new Set(['cross-env', 'env', 'time', 'nice', 'nohup', 'exec', 'command', 'dotenv', 'cross-env-shell']);

/** Shell words of a script line: quotes join, separators stand alone. Not a shell: enough to see what it runs. */
function words(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | undefined;
  const flush = () => {
    if (cur) out.push(cur);
    cur = '';
  };
  for (let n = 0; n < line.length; n++) {
    const ch = line[n];
    if (quote) {
      if (ch === quote) quote = undefined;
      else cur += ch;
      continue;
    }
    const two = line.slice(n, n + 2);
    if (two === '&&' || two === '||') {
      flush();
      out.push(two);
      n++;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ';' || ch === '|' || ch === '&' || ch === '\n') {
      flush();
      out.push(ch);
    } else if (/\s/.test(ch)) flush();
    else cur += ch;
  }
  flush();
  return out;
}

/** A command's words without the assignments, wrappers and their flags before the program. */
function unwrap(cmd: string[]): string[] {
  let n = 0;
  while (n < cmd.length) {
    const w = cmd[n];
    if (ASSIGNMENT.test(w) || WRAPPERS.has(w) || w === '--' || (n > 0 && w.startsWith('-') && WRAPPERS.has(cmd[0])))
      n++;
    else break;
  }
  return cmd.slice(n);
}

/**
 * The commands a script line runs, each as its words: `NODE_ENV=test vitest run && npm run lint` gives
 * `[vitest, run]` and `[npm, run, lint]`. Subshells, `$(…)` and variables are taken as plain words.
 */
export function commandsOf(line: string): string[][] {
  const out: string[][] = [];
  let cmd: string[] = [];
  for (const w of words(line.replace(/[()]/g, ' '))) {
    if (!SEPARATORS.has(w)) {
      cmd.push(w);
      continue;
    }
    if (cmd.length) out.push(unwrap(cmd));
    cmd = [];
  }
  if (cmd.length) out.push(unwrap(cmd));
  return out.filter((c) => c.length > 0);
}
