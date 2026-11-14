import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MarkdownFs } from '../adapters/markdown/markdownFs';
import { insideRoot } from '../projects/confinePath';
import { symlinkFree } from '../projects/symlinkFree';
import { contentHash } from '../trust/trustLedger';
import { BadRequest, readText, sendJson } from './http';
import { lanFileRefusal } from './lanFileRefusal';
import { limitedFileRefusal } from './limitedFileRefusal';
import { markedLimited } from './limitedRequests';

/**
 * What the raw file route may touch: the tracker's markdown (trails, tickets, decisions, briefs, criteria,
 * knowledge, guides). Never a dot folder (`.agents/` holds tokens, leases and answers; `.events/`, `.evidence/`),
 * and never a config file such as verification.json, whose commands run on this machine: those have their own
 * routes, which validate what they write.
 */
function isTrackerFile(rel: string) {
  const parts = rel.split(/[\\/]/);
  return rel.endsWith('.md') && parts.every((part) => part !== '' && !part.startsWith('.'));
}

const readOrMissing = (fs: MarkdownFs, p: string) => fs.read(p).catch(() => undefined);

/** The `If-Match` a writer sent: the hash of the file as it read it (`"sha256:…"`, quotes optional). */
const ifMatch = (req: IncomingMessage) => {
  const v = req.headers['if-match'];
  return typeof v === 'string' && v ? v.replace(/^W\//, '').replace(/^"|"$/g, '') : undefined;
};

export interface FileRouteContext {
  root: string;
  /** The tracker folder as this machine's Lookout reads and writes it (signed as `lookout`). */
  fs: MarkdownFs;
  /** The same for a device on the network. */
  lanFs: MarkdownFs;
  /** Whether the request comes from this machine. */
  local: (req: IncomingMessage) => boolean;
}

/** `PUT /file` with `If-None-Match: *`: written only if no file has the name (412 otherwise), for numbered files. */
async function create(c: { ctx: FileRouteContext; res: ServerResponse; p: string; text: string; local: boolean }) {
  const fs = c.local ? c.ctx.fs : c.ctx.lanFs;
  if (!fs.create) throw new Error('the tracker folder has no exclusive create');
  if (await fs.create(c.p, c.text)) return void c.res.end('ok');
  sendJson(c.res, 412, { error: `${c.p} exists: pick the next number.`, exists: true });
}

/**
 * `PUT /file`: refused from another device when it changes more than it may, and from a caller not allowed high-risk
 * calls when it decides a high-risk ticket; 409 when the file moved on.
 */
async function put(ctx: FileRouteContext, req: IncomingMessage, res: ServerResponse, p: string) {
  const text = await readText(req);
  const local = ctx.local(req);
  const before = await readOrMissing(ctx.fs, p);
  const refused = local ? undefined : lanFileRefusal(p, before, text);
  if (refused) return sendJson(res, 403, { error: refused, elsewhere: true });
  const limited = markedLimited(req) ? await limitedFileRefusal(ctx.root, { rel: p, before, after: text }) : undefined;
  if (limited) return sendJson(res, 403, { error: limited, highRisk: true });
  if (req.headers['if-none-match'] === '*') return create({ ctx, res, p, text, local });
  const match = ifMatch(req);
  if (match && match !== contentHash(before ?? ''))
    return sendJson(res, 409, { error: `${p} changed since it was loaded: reload it and try again.`, stale: true });
  try {
    await (local ? ctx.fs : ctx.lanFs).write(p, text, before === undefined || !match ? undefined : { base: before });
  } catch (e) {
    if ((e as { stale?: boolean }).stale) return sendJson(res, 409, { error: (e as Error).message, stale: true });
    throw e;
  }
  res.end('ok');
}

/**
 * Raw file access to the tracker folder: `GET /list`, and `GET`/`PUT /file?path=` for its markdown, inside the
 * folder once links are resolved and written only where no link stands on the way. A PUT may carry `If-Match`, the
 * hash of the file as the writer loaded it (the Lookout always sends it): a file that changed since answers 409
 * (`stale`), and the gate fields it changes are judged against that version (signedState/signedWrite.ts). With
 * `If-None-Match: *` it creates the file only if none is there (412 otherwise), so two writers that pick the same
 * next number never overwrite each other (createNumbered.ts).
 */
export async function handleFileRoute(ctx: FileRouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === '/list') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ root: ctx.root, files: await ctx.fs.list() }));
    return true;
  }
  if (url.pathname !== '/file') return false;
  const p = url.searchParams.get('path') ?? '';
  if (!isTrackerFile(p) || !insideRoot(ctx.root, p)) throw new BadRequest('not a tracker file');
  if (req.method === 'PUT' && !symlinkFree(ctx.root, p)) throw new BadRequest('not a tracker file');
  if (req.method === 'PUT') return (await put(ctx, req, res, p), true);
  const text = await ctx.fs.read(p).catch((e: NodeJS.ErrnoException) => {
    // A missing file is a plain 404: the error's own text names the absolute path.
    if (e.code === 'ENOENT' || e.code === 'EISDIR') return undefined;
    throw e;
  });
  if (text === undefined) return (sendJson(res, 404, { error: 'not found' }), true);
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  // what a writer sends back as If-Match: the file as it loaded it
  res.setHeader('ETag', `"${contentHash(text)}"`);
  res.end(text);
  return true;
}
