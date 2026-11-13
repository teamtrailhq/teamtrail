import { Emitter, sleep } from '../lib/emitter';
import type { MapMetaPatch, TicketMetaPatch } from '../model/lifecycle';
import { mapSummary } from '../model/mapSummary';
import {
  DEFAULT_MAP_MODE,
  type DecisionInput,
  type DecisionRecord,
  type MapMode,
  type MapSections,
  type MapSnapshot,
  type Ticket,
  type TicketType,
  type TrackerEvent,
  type MapDoc,
} from '../model/types';
import { buildDecision } from '../planning/decisions/decisionRecord';
import type { MapInput, TicketEdit, TrackerAdapter } from './adapter';
import { withMapMeta } from './mapMeta';
import { newTicket, reopened, withEdit, withoutBlocker } from './ticketEdits';
import { withMeta } from './ticketMeta';
import { withArchived } from './withArchived';

const updated = (mapId: string, id: string): TrackerEvent => ({
  kind: 'ticket.updated',
  mapId,
  ticketId: id,
  at: Date.now(),
});

export interface MemoryAdapterOptions {
  /** Simulated network latency range in ms. */
  latency?: [number, number];
  /** First issue number to hand out. */
  startNumber?: number;
  label?: string;
  location?: string;
}

/**
 * In-memory tracker that behaves like a GitHub-style issue tracker
 * (numbered issues, assignment, comments, blocking). Used by tests.
 */
export class MemoryAdapter implements TrackerAdapter {
  readonly kind = 'mock' as const;
  readonly label: string;
  readonly location: string;
  private maps = new Map<string, MapDoc>();
  private tickets = new Map<string, Ticket[]>();
  private events = new Emitter<TrackerEvent>();
  private decisions = new Map<string, DecisionRecord[]>();
  private nextDecision = 1;
  private next: number;
  /** Mutable so seeding can run through the normal operations without the delay. */
  latency: [number, number];

  constructor(opts: MemoryAdapterOptions = {}) {
    this.latency = opts.latency ?? [40, 160];
    this.next = opts.startNumber ?? 1;
    this.label = opts.label ?? 'Memory';
    this.location = opts.location ?? 'mock://demo';
  }

  private async wait() {
    const [a, b] = this.latency;
    if (b > 0) await sleep(a + Math.random() * (b - a));
  }

  private emit(e: TrackerEvent) {
    this.events.emit(e);
  }

  private ticket(mapId: string, id: string) {
    const t = this.tickets.get(mapId)?.find((x) => x.id === id);
    if (!t) throw new Error(`ticket ${id} not found in ${mapId}`);
    return t;
  }

  private touch(mapId: string, t: Ticket) {
    const list = this.tickets.get(mapId)!;
    const next = { ...t, updatedAt: Date.now() };
    this.tickets.set(
      mapId,
      list.map((x) => (x.id === t.id ? next : x)),
    );
    return next;
  }

  /** Synchronous seeding hook (no events, no latency). */
  seed(snap: MapSnapshot) {
    this.maps.set(snap.map.id, snap.map);
    this.tickets.set(snap.map.id, snap.tickets);
    const nums = [snap.map.key, ...snap.tickets.map((t) => t.key)].map((k) => Number(k.replace(/\D/g, '')) || 0);
    this.next = Math.max(this.next, ...nums) + 1;
  }

  async listMaps() {
    await this.wait();
    return [...this.maps.values()].map(mapSummary);
  }

  async loadMap(mapId: string): Promise<MapSnapshot> {
    await this.wait();
    const map = this.maps.get(mapId);
    if (!map) throw new Error(`map ${mapId} not found`);
    return structuredClone({ map, tickets: this.tickets.get(mapId) ?? [] });
  }

  async createMap(input: MapInput) {
    await this.wait();
    const n = this.next++;
    const map: MapDoc = {
      id: `map-${n}`,
      key: `#${n}`,
      title: input.title,
      mode: input.mode ?? DEFAULT_MAP_MODE,
      ...(input.verification ? { verification: input.verification } : {}),
      sections: structuredClone(input.sections),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.maps.set(map.id, map);
    this.tickets.set(map.id, []);
    this.emit({ kind: 'map.created', mapId: map.id, at: Date.now() });
    return structuredClone(map);
  }

  private async editMap(mapId: string, edit: (m: MapDoc) => MapDoc, event: TrackerEvent) {
    await this.wait();
    this.maps.set(mapId, { ...edit(this.maps.get(mapId)!), updatedAt: Date.now() });
    this.emit(event);
  }

  setMapMode = (mapId: string, mode: MapMode) =>
    this.editMap(mapId, (m) => ({ ...m, mode }), { kind: 'map.mode', mapId, mode, at: Date.now() });

  setMapArchived = (mapId: string, archived: boolean) =>
    this.editMap(mapId, (m) => withArchived(m, archived), { kind: 'map.updated', mapId, at: Date.now() });

  setMapMeta = (mapId: string, patch: MapMetaPatch) =>
    this.editMap(mapId, (m) => withMapMeta(m, patch), { kind: 'map.updated', mapId, at: Date.now() });

  async updateMapSections(mapId: string, patch: Partial<MapSections>) {
    await this.wait();
    const m = this.maps.get(mapId)!;
    this.maps.set(mapId, { ...m, sections: { ...m.sections, ...structuredClone(patch) }, updatedAt: Date.now() });
    const section = Object.keys(patch)[0] as keyof MapSections | undefined;
    this.emit({ kind: 'map.updated', mapId, section, at: Date.now() });
  }

  async createTicket(mapId: string, input: { title: string; type: TicketType; body: string; hitl?: boolean }) {
    await this.wait();
    const n = this.next++;
    const t = newTicket(`t-${n}`, `#${n}`, input);
    this.tickets.get(mapId)!.push(t);
    this.emit({ kind: 'ticket.created', mapId, ticketId: t.id, at: Date.now() });
    return structuredClone(t);
  }

  async addBlocking(mapId: string, blockerId: string, blockedId: string) {
    await this.wait();
    const t = this.ticket(mapId, blockedId);
    if (!t.blockedBy.includes(blockerId)) this.touch(mapId, { ...t, blockedBy: [...t.blockedBy, blockerId] });
    this.emit({ kind: 'edge.added', mapId, blockerId, blockedId, at: Date.now() });
  }

  /** Waits, rewrites one ticket with `change` and emits `event`. */
  private async update(mapId: string, ticketId: string, change: (t: Ticket) => Ticket, event: TrackerEvent) {
    await this.wait();
    this.touch(mapId, change(this.ticket(mapId, ticketId)));
    this.emit(event);
  }

  async removeBlocking(mapId: string, blockerId: string, blockedId: string) {
    if (!this.ticket(mapId, blockedId).blockedBy.includes(blockerId)) return;
    const event: TrackerEvent = { kind: 'edge.removed', mapId, blockerId, blockedId, at: Date.now() };
    await this.update(mapId, blockedId, (t) => withoutBlocker(t, blockerId), event);
  }

  async editTicket(mapId: string, ticketId: string, edit: TicketEdit) {
    await this.update(mapId, ticketId, (t) => withEdit(t, edit), updated(mapId, ticketId));
  }

  async reopen(mapId: string, ticketId: string) {
    await this.update(mapId, ticketId, reopened, updated(mapId, ticketId));
  }

  async assign(mapId: string, ticketId: string, assignee: string | null) {
    const event: TrackerEvent = assignee
      ? { kind: 'ticket.claimed', mapId, ticketId, assignee, at: Date.now() }
      : { kind: 'ticket.released', mapId, ticketId, at: Date.now() };
    await this.update(mapId, ticketId, (t) => ({ ...t, assignee: assignee ?? undefined }), event);
  }

  async comment(mapId: string, ticketId: string, author: string, body: string) {
    const add = (t: Ticket): Ticket => {
      const c = { id: `c-${Date.now().toString(36)}${t.comments.length}`, author, body, createdAt: Date.now() };
      return { ...t, comments: [...t.comments, c] };
    };
    await this.update(mapId, ticketId, add, { kind: 'ticket.commented', mapId, ticketId, at: Date.now() });
  }

  async close(mapId: string, ticketId: string, reason: 'completed' | 'not_planned') {
    const close = (t: Ticket): Ticket => ({ ...t, state: 'closed', closeReason: reason, closedAt: Date.now() });
    await this.update(mapId, ticketId, close, { kind: 'ticket.closed', mapId, ticketId, reason, at: Date.now() });
  }

  async setMeta(mapId: string, ticketId: string, patch: TicketMetaPatch) {
    await this.update(mapId, ticketId, (t) => withMeta(t, patch), updated(mapId, ticketId));
  }

  async listDecisions(mapId: string) {
    await this.wait();
    return structuredClone(this.decisions.get(mapId) ?? []);
  }

  async createDecision(mapId: string, input: DecisionInput) {
    await this.wait();
    const d = buildDecision(`D-${this.nextDecision++}`, mapId, structuredClone(input));
    this.decisions.set(mapId, [...(this.decisions.get(mapId) ?? []), d]);
    this.emit({ kind: 'decision.recorded', mapId, decisionId: d.id, ticketId: d.ticketId, at: Date.now() });
    return structuredClone(d);
  }

  async markSuperseded(mapId: string, decisionId: string, supersededBy: string) {
    await this.wait();
    const list = this.decisions.get(mapId) ?? [];
    if (!list.some((d) => d.id === decisionId)) throw new Error(`decision ${decisionId} not found in ${mapId}`);
    this.decisions.set(
      mapId,
      list.map((d) => (d.id === decisionId ? { ...d, supersededBy } : d)),
    );
    this.emit({ kind: 'decision.superseded', mapId, decisionId, supersededBy, at: Date.now() });
  }

  subscribe(listener: (e: TrackerEvent) => void) {
    return this.events.on(listener);
  }
}
