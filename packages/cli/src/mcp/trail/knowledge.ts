import {
  flaggedNote,
  isKind,
  OperationError,
  repoPaths,
  pathsIn,
  searchKnowledge,
  selectKnowledge,
  staleAnchors,
  type KnowledgeKind,
  type MapSnapshot,
  type Ticket,
} from '@teamtrail/core';
import {
  blobHash,
  createKnowledge,
  listKnowledge,
  readBrief,
  readKnowledge,
  repoRootFor,
  repoRootSpellings,
  writeKnowledge,
} from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/** The knowledge an agent gets with `t`: picked by paths (ticket and brief), words, trail and kind, with a why. */
export function knowledgeFor(root: string, snap: MapSnapshot, t: Ticket) {
  const entries = listKnowledge(root);
  if (!entries.length) return undefined;
  const brief = readBrief(root, snap.map.id);
  const repo = repoRootFor(root);
  const picked = selectKnowledge(
    entries,
    {
      trailKey: snap.map.key,
      ticket: { type: t.type, title: t.title, body: t.body },
      paths: pathsIn(`${t.body}\n${brief?.sections.existing ?? ''}\n${brief?.sections.conventions ?? ''}`),
      discovery: !!brief && brief.ticketId === t.id,
    },
    4000,
    (e) => staleAnchors(e, (p) => blobHash(repo, p)),
  );
  return picked.length ? picked : undefined;
}

export async function proposeKnowledge(
  ctx: AgentContext,
  input: {
    kind: string;
    title: string;
    body: string;
    scope?: string[];
    tags?: string[];
    files?: string[];
    trail?: string;
  },
) {
  if (!isKind(input.kind)) throw new OperationError(`unknown kind "${input.kind}"`);
  const agent = await ctx.agentId();
  const snap = await ctx.resolveTrail(input.trail).catch(() => undefined);
  const ticketId = ctx.sessions.current?.info.ticketId;
  const now = Date.now();
  const anchors = repoPaths(input.files, repoRootSpellings(repoRootFor(ctx.root))).map((path) => ({ path }));
  const draft = {
    title: input.title.trim(),
    body: input.body.trim(),
    kind: input.kind as KnowledgeKind,
    status: 'suggested' as const,
    scope: input.scope ?? [],
    tags: input.tags ?? [],
    sources: [
      ...(snap ? [`trail:${snap.map.key}`] : []),
      ...(snap && ticketId ? [`ticket:${ctx.keyOf(ticketId)}`] : []),
      ...(ctx.sessions.current ? [`session:${ctx.sessions.current.id}`] : []),
    ],
    anchors,
    createdBy: agent,
    createdAt: now,
    updatedAt: now,
  };
  const entry = createKnowledge(ctx.root, draft);
  ctx.proposed.add(entry.id);
  ctx.sessions.current?.log(`proposed knowledge ${entry.id}: ${entry.title}`);
  return {
    proposed: { id: entry.id, status: entry.status },
    note: 'The human reviews it in the Lookout. Until they confirm it (or keep it as an assumption), no other agent gets it: not with claims, not in search_knowledge.',
  };
}

/**
 * `search_knowledge`. Only reviewed entries reach agents: confirmed ones, assumptions the human kept, and outdated
 * ones when asked for. A suggestion is one agent's words that nobody has read yet, so other agents get none of it,
 * only how many wait for review; the agent that proposed one still sees its own.
 */
export async function searchKnowledgeOp(
  ctx: AgentContext,
  input: { query?: string; paths?: string[]; tags?: string[]; kind?: string; includeOutdated?: boolean },
) {
  const repo = repoRootFor(ctx.root);
  const all = searchKnowledge(listKnowledge(ctx.root), {
    ...input,
    kind: isKind(input.kind) ? input.kind : undefined,
  });
  const shown = all.filter((e) => e.status !== 'suggested' || ctx.proposed.has(e.id)).slice(0, 20);
  const unreviewed = all.filter((e) => e.status === 'suggested' && !ctx.proposed.has(e.id)).length;
  return {
    entries: shown.map((e) => {
      const stale = staleAnchors(e, (p) => blobHash(repo, p));
      return {
        id: e.id,
        kind: e.kind,
        status: e.status,
        ...(e.status === 'suggested' ? { reviewed: false } : {}),
        title: e.title,
        body: e.body,
        scope: e.scope,
        tags: e.tags,
        ...(stale.length ? { mayBeOutdated: stale } : {}),
        ...(e.flag ? { flagged: flaggedNote(e.flag.by) } : {}),
      };
    }),
    ...(unreviewed ? { awaitingReview: unreviewed } : {}),
    note: 'Confirmed entries are facts; assumptions are unverified. Suggestions from other agents are not shown until the human reviews them; yours are marked reviewed: false.',
  };
}

export async function flagKnowledge(ctx: AgentContext, input: { id: string; reason: string }) {
  const e = readKnowledge(ctx.root, input.id);
  if (!e) throw new OperationError(`no knowledge entry ${input.id}`);
  if (!input.reason.trim()) throw new OperationError('say what is wrong, with evidence');
  const agent = await ctx.agentId();
  writeKnowledge(ctx.root, { ...e, flag: { by: agent, reason: input.reason.trim(), at: Date.now() } });
  ctx.sessions.current?.log(`flagged knowledge ${e.id} as possibly outdated`, 'warn');
  return { flagged: e.id, note: 'The human resolves it in the Lookout.' };
}
