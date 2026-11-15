import type { IncomingMessage, ServerResponse } from 'node:http';
import { journalFile } from '../history/journalFile';
import { PROOF_POST_JOURNAL } from '../model/proofPost';
import { proofForTicket } from '../proof/proofForTicket';
import { proofPostSetting } from '../proof/proofPostSetting';
import { readProofPost } from '../proof/proofPostStore';
import { signedProofMarkdown } from '../proof/signedProofMarkdown';
import { TRAIL_LEAD } from './guideJournal';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

type ProofContext = RouteContext & { configDir?: string; kick?: () => void };

/**
 * `/proof`: Verified by Teamtrail in the Lookout.
 *   GET /proof/settings                    `{ enabled }`: whether this machine posts proofs to pull requests
 *   PUT /proof/settings  body `{ enabled }`  the trail lead's switch, this machine only (thisMachineRoutes.ts), journaled
 *   GET /proof/ticket?mapId=&ticketId=     `{ proof, markdown, post? }`: the ticket's proof and what was last posted
 * False when the path doesn't match.
 */
export async function handleProof(ctx: ProofContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  const setting = proofPostSetting(ctx.root, ctx.configDir);
  if (url.pathname === '/proof/settings' && req.method === 'GET')
    return (sendJson(res, 200, { enabled: setting.enabled() }), true);
  if (url.pathname === '/proof/settings' && req.method === 'PUT') {
    const b = await readJson<{ enabled?: unknown }>(req, '{}');
    if (typeof b.enabled !== 'boolean') throw new BadRequest('"enabled" must be true or false');
    if (b.enabled !== setting.enabled()) {
      setting.set(b.enabled);
      journalFile(ctx.root).append({
        v: 1,
        kind: 'proof-post',
        at: Date.now(),
        mapId: PROOF_POST_JOURNAL,
        action: b.enabled ? 'on' : 'off',
        actor: TRAIL_LEAD,
        actorKind: 'trail lead',
      });
      if (b.enabled) ctx.kick?.();
    }
    return (sendJson(res, 200, { enabled: setting.enabled() }), true);
  }
  if (url.pathname === '/proof/ticket' && req.method === 'GET') return (await ticketProof(ctx, res, url), true);
  return false;
}

async function ticketProof(ctx: ProofContext, res: ServerResponse, url: URL) {
  const mapId = url.searchParams.get('mapId');
  const ticketId = url.searchParams.get('ticketId');
  if (!mapId || !ticketId) throw new BadRequest('"mapId" and "ticketId" are required');
  const adapter = await ctx.active();
  const snap = await adapter.loadMap(mapId);
  const ticket = snap.tickets.find((t) => t.id === ticketId);
  if (!ticket) return sendJson(res, 404, { error: `no ticket ${ticketId} in this trail` });
  const proof = proofForTicket({ root: ctx.root, snap, ticket, decisions: await adapter.listDecisions(mapId) });
  const post = readProofPost(ctx.root, mapId, ticketId);
  const { markdown, keyFile } = signedProofMarkdown(ctx.root, proof, ctx.configDir);
  sendJson(res, 200, { proof, markdown, ...(keyFile ? { keyFile } : {}), ...(post ? { post } : {}) });
}
