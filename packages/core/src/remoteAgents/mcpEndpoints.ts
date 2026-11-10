import { readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { processAlive } from '../lib/processAlive';
import { announcementSig } from '../machine/announcementSig';
import { announcementSigned } from '../machine/announcementSigned';
import type { McpEndpoint } from '../model/remoteToken';
import { ownEndpointUrl } from './endpointUrl';

/*
 * Where remote agents can connect right now, one file per serving process:
 *   <tracker dir>/.agents/mcp-endpoints/<pid>.json   McpEndpoint
 * Local only. A file whose process is gone is ignored, so a crash leaves nothing stale on screen.
 */
const DIR = `${AGENTS_DIR}/mcp-endpoints`;

const ENDPOINT_SIG = 'mcp-endpoint';
const fieldsOf = (e: Omit<McpEndpoint, 'sig'>) => [e.url, e.pid, e.kind, e.network === true, e.startedAt];

/** Announces this process's MCP endpoint, signed with the machine key; returns the function that takes it back. */
export function writeMcpEndpoint(root: string, e: Pick<McpEndpoint, 'url' | 'kind' | 'network'>) {
  const file = path.join(root, DIR, `${process.pid}.json`);
  ensureLocalDir(path.join(root, AGENTS_DIR));
  const base = { url: e.url, kind: e.kind, network: e.network, pid: process.pid, startedAt: Date.now() };
  const sig = announcementSig(root, ENDPOINT_SIG, fieldsOf(base));
  const endpoint: McpEndpoint = { ...base, ...(sig ? { sig } : {}) };
  writeJsonAtomic(file, endpoint);
  return () => rmSync(file, { force: true });
}

const ownAddresses = () =>
  Object.values(os.networkInterfaces())
    .flatMap((list) => list ?? [])
    .map((a) => a.address.toLowerCase());

/**
 * One announcement, believed only as far as it can be checked here: it is signed with this machine's key (only a
 * Teamtrail of this machine, with the user's config folder, can sign; machine/announcementSig.ts), the file is named
 * after a live process, and its URL is a plain `http://<this machine>:<port>/mcp` (endpointUrl.ts). Anything else in
 * `.agents/` an agent could have written, and the URL goes into a command the human copies.
 */
function believed(root: string, at: { name: string; addresses: string[] }, e: McpEndpoint | undefined) {
  if (!e || !Number.isInteger(e.pid) || at.name !== `${e.pid}.json` || !processAlive(e.pid)) return undefined;
  if (!announcementSigned(root, ENDPOINT_SIG, fieldsOf(e), e.sig)) return undefined;
  const { addresses } = at;
  if (e.kind !== 'lookout' && e.kind !== 'standalone') return undefined;
  const url = ownEndpointUrl(e.url, addresses);
  if (!url) return undefined;
  return { url, pid: e.pid, kind: e.kind, network: e.network === true, startedAt: Number(e.startedAt) || 0 };
}

/** The endpoints being served now: the one made to be shared (`standalone`) first, then by start time. */
export function readMcpEndpoints(root: string): McpEndpoint[] {
  let names: string[] = [];
  try {
    names = readdirSync(path.join(root, DIR)).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const addresses = ownAddresses();
  return names
    .map((n) => believed(root, { name: n, addresses }, readJsonFile<McpEndpoint>(path.join(root, DIR, n))))
    .filter((e): e is McpEndpoint => !!e)
    .sort((a, b) => Number(b.kind === 'standalone') - Number(a.kind === 'standalone') || a.startedAt - b.startedAt);
}
