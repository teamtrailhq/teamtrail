import type { MarkdownFs } from '@teamtrail/core';
import { apiBase } from './apiBase';
import { onTrackerChange } from './trackerChanges';

/** The ETag of each file as last loaded, with its text: a write based on that text sends it back as If-Match. */
const loaded = new Map<string, { text: string; etag: string }>();

const fileUrl = (path: string) => `${apiBase()}/file?path=${encodeURIComponent(path)}`;

/** A failed request as an error; `stale` (409): the file changed since it was loaded, `code` ENOENT for a 404. */
async function failure(r: Response, what: string) {
  const body = (await r.json().catch(() => ({}))) as { error?: string };
  const error = new Error(body.error ?? `${what}: ${r.status}`);
  if (r.status === 409) return Object.assign(error, { stale: true });
  return r.status === 404 ? Object.assign(error, { code: 'ENOENT' }) : error;
}

/**
 * The tracker folder over the local server's file API (fileRoute.ts). A write carries the ETag of the text it was
 * based on, so the server refuses it (409, `stale`) when the file changed in between, instead of undoing a change
 * nobody here saw.
 */
export const httpFs: MarkdownFs = {
  async list() {
    const r = await fetch(`${apiBase()}/list`);
    return (await r.json()).files as string[];
  },
  async read(path) {
    const r = await fetch(fileUrl(path));
    if (!r.ok) throw await failure(r, `read ${path}`);
    const text = await r.text();
    const etag = r.headers.get('ETag');
    if (etag) loaded.set(path, { text, etag });
    return text;
  },
  async write(path, text, opts) {
    const seen = opts?.base === undefined ? undefined : loaded.get(path);
    const headers: Record<string, string> = seen && seen.text === opts?.base ? { 'If-Match': seen.etag } : {};
    const r = await fetch(fileUrl(path), { method: 'PUT', body: text, headers });
    if (!r.ok) throw await failure(r, `write ${path}`);
    loaded.delete(path);
  },
  watch(cb) {
    return onTrackerChange(cb);
  },
};
