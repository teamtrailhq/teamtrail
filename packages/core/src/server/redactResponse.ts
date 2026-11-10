import type { ServerResponse } from 'node:http';
import { lanRedactor, redactEvents, redactForLan } from './redactForLan';

type Marked = ServerResponse & { lanPlaces?: string[] };
type Write = (...args: unknown[]) => unknown;

const typeOf = (res: ServerResponse) => String(res.getHeader('Content-Type') ?? '');

/**
 * Makes everything this response sends to another device go through `redactForLan`: JSON answers, and every
 * event of a server-sent stream (lease, session and workspace events carry worktree paths). `places` are the
 * folders whose paths are shortened wherever they appear. Safe to apply twice: the places add up, which is how
 * the hub's and a project bridge's both apply.
 */
export function redactResponse(res: ServerResponse, places: string[] = []) {
  const marked = res as Marked;
  if (marked.lanPlaces) return void marked.lanPlaces.push(...places);
  const all = (marked.lanPlaces = [...places]);
  let known = 0;
  let redactor = lanRedactor(all);
  const current = () => {
    if (known !== all.length) redactor = lanRedactor(all);
    known = all.length;
    return redactor;
  };
  const end = res.end.bind(res) as Write;
  const write = res.write.bind(res) as Write;
  const redacted = (chunk: unknown) => {
    if (typeof chunk !== 'string') return chunk;
    const type = typeOf(res);
    if (type.startsWith('text/event-stream')) return redactEvents(chunk, current());
    if (!type.startsWith('application/json')) return chunk;
    try {
      return JSON.stringify(redactForLan(JSON.parse(chunk), current()));
    } catch {
      return current()(chunk);
    }
  };
  res.end = ((chunk?: unknown, ...rest: unknown[]) => end(redacted(chunk), ...rest)) as ServerResponse['end'];
  res.write = ((chunk: unknown, ...rest: unknown[]) => write(redacted(chunk), ...rest)) as ServerResponse['write'];
}
