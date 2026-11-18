import type { IncomingMessage, ServerResponse } from 'node:http';
import { journalFile } from '../history/journalFile';
import { PROOF_POST_JOURNAL } from '../model/proofPost';
import { gapsHash } from '../proof/gapsHash';
import { mergeAcceptances } from '../proof/mergeAcceptances';
import { proofForTicket } from '../proof/proofForTicket';
import { proofPostSetting } from '../proof/proofPostSetting';
import { readProofPost } from '../proof/proofPostStore';
import { signedProofMarkdown } from '../proof/signedProofMarkdown';
import { ticketGapPlan } from '../proof/ticketGapPlan';
import { TRAIL_LEAD } from './guideJournal';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

type ProofContext = RouteContext & { configDir?: string; kick?: () => void };

/**
 * `/proof`: Verified by Teamtrail in the Lookout.
 *   GET /proof/settings                    `{ enabled }`: whether this machine posts proofs to pull requests
 *   PUT /proof/settings  body `{ enabled }`  the trail lead's switch, this machine only (thisMachineRoutes.ts), journaled
 *   GET /proof/ticket?mapId=&ticketId=     `{ proof, plan, markdown, post?, gapsHash, mergeAnyway? }`: the ticket's proof,
 *     who is on each of its gaps and what closes it (`plan`, proof/gapPlan.ts), what
 *     was last posted, the hash of its gaps and the trail lead's Merge anyway that accepted exactly them (mergeAnyway.ts)
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
  if (url.pathname === '/proof/trail' && req.method === 'GET') return (await trailProofs(ctx, res, url), true);
  return false;
}

/**
 * `GET /proof/trail?mapId=`: whether each done ticket's proof is verified, for the map's checks (a verified ticket's
 * check is green; one closed without a passing completion, grey). Read-only, from the recorded attempts.
 */
async function trailProofs(ctx: ProofContext, res: ServerResponse, url: URL) {
  const mapId = url.searchParams.get('mapId');
  if (!mapId) throw new BadRequest('"mapId" is required');
  const adapter = await ctx.active();
  const snap = await adapter.loadMap(mapId);
  const decisions = await adapter.listDecisions(mapId);
  const done = snap.tickets.filter((t) => t.state === 'closed' && t.closeReason === 'completed');
  const statuses = Object.fromEntries(
    done.map((ticket) => [ticket.id, proofForTicket({ root: ctx.root, snap, ticket, decisions }).status]),
  );
  sendJson(res, 200, { statuses });
}

async function ticketProof(ctx: ProofContext, res: ServerResponse, url: URL) {
  const mapId = url.searchParams.get('mapId');
  const ticketId = url.searchParams.get('ticketId');
  if (!mapId || !ticketId) throw new BadRequest('"mapId" and "ticketId" are required');
  const adapter = await ctx.active();
  const snap = await adapter.loadMap(mapId);
  const ticket = snap.tickets.find((t) => t.id === ticketId);
  if (!ticket) return sendJson(res, 404, { error: `no ticket ${ticketId} in this trail` });
  const decisions = await adapter.listDecisions(mapId);
  const first = ticketGapPlan({ root: ctx.root, snap, ticket, decisions });
  const post = readProofPost(ctx.root, mapId, ticketId);
  const { markdown, keyFile } = signedProofMarkdown(ctx.root, first.proof, ctx.configDir);
  const hash = gapsHash({ head: first.proof.git?.head ?? null, gaps: first.proof.gaps });
  const accepted = mergeAcceptances.covering(ctx.root, { mapId, ticketId, gapsHash: hash });
  // who is on each gap: a Merge anyway of exactly these gaps counts as the trail lead accepting them
  const { proof, plan } = accepted
    ? ticketGapPlan({ root: ctx.root, snap, ticket, decisions, mergedAnywayBy: accepted.by })
    : first;
  sendJson(res, 200, {
    proof,
    plan,
    markdown,
    gapsHash: hash,
    ...(keyFile ? { keyFile } : {}),
    ...(post ? { post } : {}),
    ...(accepted ? { mergeAnyway: { by: accepted.by, at: accepted.at } } : {}),
  });
}
