import type { HandlerDeps, HttpHandler } from './types';

const USER_CHOICE = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice';
const PROG_ID = /^[A-Za-z0-9][\w.-]{0,200}$/;

/** The value of a `reg query` answer: `    ProgId    REG_SZ    ChromeHTML`. */
const regValue = (out: string) => /REG_(?:EXPAND_)?SZ\s+(.+)$/m.exec(out)?.[1]?.trim();

/** `"C:\…\chrome.exe" --single-argument %1`: the program and its arguments, `%1` where the file goes. */
function parseCommand(line: string) {
  const m = /^"([^"]+)"\s*(.*)$/.exec(line) ?? /^(\S+)\s*(.*)$/.exec(line);
  if (!m) return undefined;
  return { exe: m[1], args: m[2].split(/\s+/).filter(Boolean) };
}

/** The arguments with the file in place of `%1` (quoted or not), or after them when there's no `%1`. */
function withFile(args: string[], file: string) {
  const hasSlot = args.some((a) => a.includes('%1'));
  const filled = args.map((a) => (a.includes('%1') ? file : a));
  return hasSlot ? filled : [...filled, file];
}

function openCommand(run: HandlerDeps['run']) {
  const progId = regValue(run('reg', ['query', USER_CHOICE, '/v', 'ProgId']));
  if (!progId || !PROG_ID.test(progId)) return undefined;
  const line = regValue(run('reg', ['query', `HKCR\\${progId}\\shell\\open\\command`, '/ve']));
  const parsed = line ? parseCommand(line) : undefined;
  return parsed ? { progId, ...parsed } : undefined;
}

/**
 * Windows: the http UserChoice ProgId and its open command, run directly on the file: no `cmd`, so nothing in the
 * path is parsed by a shell.
 */
export function windowsHttpHandler(deps: Pick<HandlerDeps, 'run'>): HttpHandler {
  let found: ReturnType<typeof openCommand>;
  try {
    found = openCommand(deps.run);
  } catch {
    return { kind: 'none', why: "couldn't read the default browser from the registry" };
  }
  if (!found) return { kind: 'none', why: 'no default browser is set for http' };
  const { progId, exe, args } = found;
  return { kind: 'app', name: progId, command: (file) => [exe, withFile(args, file)] };
}
