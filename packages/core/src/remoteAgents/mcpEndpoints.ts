import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { processAlive } from '../lib/processAlive';
import type { McpEndpoint } from '../model/remoteToken';
import { ownEndpointUrl } from './endpointUrl';

/*
 * Where remote agents can connect right now, one file per serving process:
 *   <tracker dir>/.agents/mcp-endpoints/<pid>.json   McpEndpoint
 * Local only. A file whose process is gone is ignored, so a crash leaves nothing stale on screen.
 */
const DIR = `${AGENTS_DIR}/mcp-endpoints`;

/** Announces this process's MCP endpoint; returns the function that takes the announcement back. */
export function writeMcpEndpoint(root: string, e: Pick<McpEndpoint, 'url' | 'kind' | 'network'>) {
  const file = path.join(root, DIR, `${process.pid}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  const endpoint: McpEndpoint = { ...e, pid: process.pid, startedAt: Date.now() };
  writeJsonAtomic(file, endpoint);
  return () => rmSync(file, { force: true });
}

const ownAddresses = () =>
  Object.values(os.networkInterfaces())
    .flatMap((list) => list ?? [])
    .map((a) => a.address.toLowerCase());

/**
 * One announcement, believed only as far as it can be checked here: the file is named after a live process, and
 * its URL is a plain `http://<this machine>:<port>/mcp` (endpointUrl.ts). Anything else in `.agents/` an agent
 * could have written, and the URL goes into a command the human copies. This does not prove the process is a
 * Teamtrail: that needs the per-machine key the trust-state work brings.
 * TODO(#60): once the machine store lands, sign announcements with the per-machine key and check the signature
 * here, so another local process can't announce an endpoint at all.
 */
function believed(name: string, e: McpEndpoint | undefined, addresses: string[]): McpEndpoint | undefined {
  if (!e || !Number.isInteger(e.pid) || name !== `${e.pid}.json` || !processAlive(e.pid)) return undefined;
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
    .map((n) => believed(n, readJsonFile<McpEndpoint>(path.join(root, DIR, n)), addresses))
    .filter((e): e is McpEndpoint => !!e)
    .sort((a, b) => Number(b.kind === 'standalone') - Number(a.kind === 'standalone') || a.startedAt - b.startedAt);
}
