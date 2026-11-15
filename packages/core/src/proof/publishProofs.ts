import type { TrackerAdapter } from '../adapters/adapter';
import { readTicketSync } from '../evidence/syncStore';
import type { ProofPostRecord, ProofPublisher } from '../model/proofPost';
import type { MapSnapshot, Ticket } from '../model/types';
import { redact } from '../verification/redact';
import { proofForTicket } from './proofForTicket';
import { readProofPost, writeProofPost } from './proofPostStore';
import { proofStatus } from './proofStatus';
import { signedProofMarkdown } from './signedProofMarkdown';

export interface PublishEnv {
  root: string;
  adapter: TrackerAdapter;
  publisher: ProofPublisher;
  /** The config dir whose proof key signs the reports. */
  configDir?: string;
  now?: () => number;
}

const done = (t: Ticket) => t.state === 'closed' && t.closeReason === 'completed';

/** Posts one ticket's proof when it, the PR or the PR's head changed since this machine last posted it. */
async function publishOne(
  env: PublishEnv,
  snap: MapSnapshot,
  t: Ticket,
  decisions: Parameters<typeof proofForTicket>[0]['decisions'],
) {
  const sync = readTicketSync(env.root, snap.map.id, t.id);
  const pr = sync?.pr;
  if (!pr || pr.state !== 'open' || !pr.headSha) return undefined;
  const proof = proofForTicket({ root: env.root, snap, ticket: t, decisions });
  const status = proofStatus(proof, pr.headSha);
  const prev = readProofPost(env.root, snap.map.id, t.id);
  const same =
    prev && !prev.error && prev.pr === pr.number && prev.headSha === pr.headSha && prev.digest === proof.digest;
  if (same) return undefined;
  const now = (env.now ?? Date.now)();
  const base = {
    v: 1 as const,
    mapId: snap.map.id,
    ticketId: t.id,
    pr: pr.number,
    headSha: pr.headSha,
    digest: proof.digest,
    state: status.state,
    triedAt: now,
  };
  let rec: ProofPostRecord;
  try {
    const { url } = await env.publisher.upsertComment(
      pr.number,
      signedProofMarkdown(env.root, proof, env.configDir).markdown,
    );
    await env.publisher.setStatus(pr.headSha, { ...status, targetUrl: url });
    rec = { ...base, commentUrl: url, postedAt: now };
  } catch (e) {
    rec = { ...base, commentUrl: prev?.commentUrl, error: redact(String((e as Error)?.message ?? e)).slice(0, 300) };
  }
  writeProofPost(env.root, rec);
  return rec;
}

/**
 * Posts the proof of every done ticket whose pull request is open (as the reconciler last read it) to that PR, once
 * per proof, PR and head: what changed since the last pass, and anything whose last try failed (offline, a rate
 * limit), so nothing is lost while the machine is offline. Never changes a ticket.
 */
export async function publishProofs(env: PublishEnv): Promise<ProofPostRecord[]> {
  const out: ProofPostRecord[] = [];
  for (const summary of await env.adapter.listMaps()) {
    const snap = await env.adapter.loadMap(summary.id);
    const tickets = snap.tickets.filter(done);
    if (!tickets.length) continue;
    const decisions = await env.adapter.listDecisions(snap.map.id);
    for (const t of tickets) {
      const rec = await publishOne(env, snap, t, decisions);
      if (rec) out.push(rec);
    }
  }
  return out;
}
