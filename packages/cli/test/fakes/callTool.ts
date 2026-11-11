import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MarkdownAdapter, type TrackerAdapter } from '@teamtrail/core';
import { approveReroute, journalFile, readReroute, rerouteHash } from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';

type Args = Record<string, unknown>;
type Result = { isError?: boolean; content: { text: string }[] };

/**
 * A tool call as the tests make them. Skipping discovery is the trail lead's call: `start_trail` with
 * `discovery: false` charts the trail with discovery and asks them (trail/settings.ts). Most tests chart without
 * discovery only to get to what they test, so here the trail lead approves that request in the Lookout at once,
 * as they would. Tests about the request itself make the call without this helper.
 */
export async function callTool(
  client: Client,
  root: string,
  name: string,
  args: Args,
  o: { timeout?: number; adapter?: TrackerAdapter } = {},
) {
  const r = (await client.callTool(
    { name, arguments: args },
    undefined,
    o.timeout ? { timeout: o.timeout } : undefined,
  )) as Result;
  if (name !== 'start_trail' || args.discovery !== false || r.isError) return r;
  const out = JSON.parse(r.content[0].text) as { trail: { id: string }; skipDiscovery?: { request: string } };
  if (out.skipDiscovery)
    await approveInLookout({ root, mapId: out.trail.id, id: out.skipDiscovery.request, adapter: o.adapter });
  return r;
}

/** The trail lead approves a request as the Lookout shows it: bound to the hash of what they saw. */
export async function approveInLookout(a: { root: string; mapId: string; id: string; adapter?: TrackerAdapter }) {
  const adapter = a.adapter ?? new MarkdownAdapter({ ...nodeMarkdownFs(a.root), watch: undefined }, a.root);
  const p = readReroute(a.root, a.mapId, a.id)!;
  return approveReroute(
    { root: a.root, adapter, journal: journalFile(a.root) },
    { mapId: a.mapId, id: a.id, by: 'trail lead', hash: rerouteHash(p) },
  );
}
