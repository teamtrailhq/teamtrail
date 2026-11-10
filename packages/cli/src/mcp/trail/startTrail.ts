import {
  chooseNext,
  chartMap,
  DISCOVERY_TICKET,
  OperationError,
  setTicketGuide,
  setTrailTeam,
  type MapDoc,
  type MapMode,
  type Ticket,
} from '@teamtrail/core';
import { listGuides, readVerificationConfig, recordCharted, writeBrief } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { addTrailAssumptions, type AssumptionPlanInput } from './assumptions';
import { saveCriteria } from './criteria';
import { briefView, claimable } from './discovery';
import { assertGuide } from './guides';
import { knowledgeFor } from './knowledge';
import { ticketInfo } from './ticketInfo';
import type { TicketPlanInput } from './types';

interface StartInput {
  title: string;
  destination: string;
  notes?: string;
  mode?: MapMode;
  tickets?: TicketPlanInput[];
  decided?: string[];
  unspecified?: string[];
  outOfScope?: string[];
  /** Default on: implementation waits for an accepted discovery brief. Off only when the human says to skip it. */
  discovery?: boolean;
  /** What the trail relies on; `tickets` are plan refs. */
  assumptions?: AssumptionPlanInput[];
  /** The trail's team of installed guide ids. */
  team?: string[];
}

const EMPTY_BRIEF = {
  summary: '',
  productContext: '',
  existing: '',
  conventions: '',
  dataModel: '',
  api: '',
  risks: '',
  assumptions: [],
  openQuestions: [],
};

/** `start_trail`: charts the map and its tickets, saves their criteria and opens the discovery brief. */
export async function startTrail(ctx: AgentContext, input: StartInput) {
  const planned = input.tickets ?? [];
  const withDiscovery = input.discovery !== false;
  const s = await ctx.chartSession();
  s.step(1, input.destination);
  s.step(2, `${planned.length} tickets proposed`);
  for (const t of planned) s.log(`proposed ${t.type} · ${t.title}`);
  assertKnownRefs(planned, input.assumptions ?? []);
  assertGuides(ctx, input);
  s.step(3, input.title);
  const agent = await ctx.agentId();
  const { map, tickets } = await chartMap(ctx.adapter, chartInput(ctx, input, agent), {
    onMapCreated: (m) => {
      s.bindMap(m.id);
      s.log(`trail ${m.key} online`, 'ok');
      s.step(4, `${planned.length} tickets`);
    },
  });
  ctx.trail = map.id;
  recordCharted(
    ctx.root,
    map.id,
    tickets.map((t) => t.id),
    { agent, origin: ctx.origin },
  );
  saveAllCriteria(ctx, { map, tickets, planned });
  await saveGuides(ctx, { map, tickets, planned, team: input.team });
  await saveAssumptions(ctx, { map, tickets, planned, items: input.assumptions ?? [] });
  const discoveryTicket = withDiscovery ? tickets.find((t) => t.title === DISCOVERY_TICKET.title) : undefined;
  if (discoveryTicket)
    writeBrief(ctx.root, { mapId: map.id, status: 'draft', ticketId: discoveryTicket.id, sections: EMPTY_BRIEF });
  s.step(5, 'ready for agents');
  const framing = ctx.sessions.transcript(s.id) ?? [];
  ctx.sessions.end(true, `Trail launched · ${tickets.length} tickets`, true);
  const snap = await ctx.load(map.id);
  const next = chooseNext(snap, { types: claimable(ctx.root, map.id) });
  return {
    trail: {
      id: map.id,
      key: map.key,
      title: map.title,
      mode: map.mode,
      ...(map.verification ? { verification: map.verification } : {}),
      ...(input.team?.length ? { team: input.team } : {}),
    },
    tickets: tickets.map((t) => ({
      ref: planned.find((p) => p.title === t.title)?.ref,
      key: t.key,
      title: t.title,
      type: t.type,
    })),
    framingQuestionsAnswered: framing.filter((e) => e.from === 'human').length,
    discovery: briefView(ctx.root, snap),
    next: next ? ticketInfo(ctx.root, snap, next) : null,
    knowledge: next ? knowledgeFor(ctx.root, snap, next) : undefined,
    lookout: ctx.lookout(),
  };
}

function assertKnownRefs(planned: TicketPlanInput[], assumptions: AssumptionPlanInput[]) {
  const refs = new Set(planned.map((t) => t.ref));
  for (const t of planned) {
    const unknown = (t.blockedBy ?? []).find((b) => !refs.has(b));
    if (unknown) throw new OperationError(`ticket "${t.ref}" is blocked by unknown ref "${unknown}"`);
  }
  for (const a of assumptions) {
    const unknown = (a.tickets ?? []).find((r) => !refs.has(r));
    if (unknown) throw new OperationError(`assumption "${a.text}" names unknown ticket ref "${unknown}"`);
  }
}

/**
 * A decision passed to start_trail is the charting agent's account of something settled, not a record anyone
 * made: no question, no answer, no author. Its line says so, so it is never read as the human's.
 */
const statedBy = (agent: string) => (text: string) => `${text.trim()} (stated by ${agent} when charting)`;

/** The map to chart: sections from the input, the repo's default verification level, discovery first. */
function chartInput(ctx: AgentContext, input: StartInput, agent: string) {
  const level = readVerificationConfig(ctx.root).config?.default;
  const verifies = level !== undefined && level !== 'off';
  const discovery = input.discovery === false ? [] : [{ ref: '__discovery', ...DISCOVERY_TICKET }];
  return {
    title: input.title,
    mode: input.mode,
    ...(verifies ? { verification: level } : {}),
    sections: {
      destination: input.destination,
      notes: input.notes ?? '',
      decisions: (input.decided ?? []).map(statedBy(agent)).map((text) => ({ text })),
      unspecified: input.unspecified ?? [],
      outOfScope: input.outOfScope ?? [],
    },
    tickets: [...discovery, ...(input.tickets ?? []).map((t) => ({ ...t, body: t.body ?? '' }))],
  };
}

/** start_trail's assumptions, their plan refs resolved to the tickets just created. */
async function saveAssumptions(
  ctx: AgentContext,
  made: { map: MapDoc; tickets: Ticket[]; planned: TicketPlanInput[]; items: AssumptionPlanInput[] },
) {
  if (!made.items.length) return;
  const byRef = new Map<string, string>();
  for (const pt of made.planned) {
    const t = made.tickets.find((x) => x.title === pt.title);
    if (t) byRef.set(pt.ref, t.id);
  }
  const snap = await ctx.load(made.map.id);
  const items = made.items.map((a) => ({ ...a, tickets: (a.tickets ?? []).map((r) => byRef.get(r) ?? r) }));
  await addTrailAssumptions(ctx, snap, items);
}

function saveAllCriteria(ctx: AgentContext, made: { map: MapDoc; tickets: Ticket[]; planned: TicketPlanInput[] }) {
  for (const pt of made.planned) {
    if (!pt.criteria?.length) continue;
    const ticket = made.tickets.find((x) => x.title === pt.title);
    if (ticket) saveCriteria(ctx.root, made.map, ticket, pt.criteria);
  }
}

/** Every guide named (team and tickets) must be installed and active, and made for its ticket's type. */
function assertGuides(ctx: AgentContext, input: StartInput) {
  const guides = listGuides(ctx.root);
  for (const id of input.team ?? []) assertGuide(guides, id);
  for (const t of input.tickets ?? []) if (t.guide) assertGuide(guides, t.guide, t.type);
}

/** The team on the trail and each planned ticket's guide, as the agent that charted it. */
async function saveGuides(
  ctx: AgentContext,
  made: { map: MapDoc; tickets: Ticket[]; planned: TicketPlanInput[]; team?: string[] },
) {
  if (made.team?.length) await setTrailTeam(ctx.adapter, made.map.id, made.team, 'agent');
  for (const pt of made.planned) {
    const t = pt.guide ? made.tickets.find((x) => x.title === pt.title) : undefined;
    if (t) await setTicketGuide(ctx.adapter, { mapId: made.map.id, ticketId: t.id }, pt.guide!, 'agent');
  }
}
