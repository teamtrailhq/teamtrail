import { Emitter } from '../../lib/emitter';
import { BRAND } from '../../model/brand';
import type { MapMetaPatch, TicketMetaPatch } from '../../model/lifecycle';
import {
  DEFAULT_MAP_MODE,
  type DecisionInput,
  type DecisionRecord,
  type MapDoc,
  type MapMode,
  type MapSections,
  type MapSnapshot,
  type Ticket,
  type TicketType,
  type TrackerEvent,
} from '../../model/types';
import { parseDecision, serializeDecision } from '../../planning/decisions/decisionFile';
import type { MapInput, TicketEdit, TrackerAdapter } from '../adapter';
import { withMapMeta } from '../mapMeta';
import { reopened, withEdit, withoutBlocker } from '../ticketEdits';
import { withMeta } from '../ticketMeta';
import { createNumbered, newDecisionFile, newTicketFile, type NumberedFile } from './createNumbered';
import { ExternalChanges } from './externalChanges';
import { parseMapFile, serializeMapFile } from './mapFile';
import type { MarkdownFs } from './markdownFs';
import { nextNumber } from './nextNumber';
import { trailSlug } from './paths';
import { parseTicket, serializeTicket } from './ticketFile';

/*
 * Labels mirror the tracker labels (see brand.ts); HITL tasks carry HITL_LABEL.
 * Layout:
 *   <map-slug>/map.md           frontmatter + canonical map body
 *   <map-slug>/tickets/<n>.md   frontmatter + body + "## Comments"
 *   <map-slug>/decisions/D-<n>.md  decision record (decisions.ts)
 */

export class MarkdownAdapter implements TrackerAdapter {
  readonly kind = 'markdown' as const;
  readonly label = 'Local markdown';
  private events = new Emitter<TrackerEvent>();
  private selfWrites = new Map<string, number>();
  private external = new ExternalChanges(
    (path) => this.fs.read(path),
    (e) => this.events.emit(e),
  );

  constructor(
    private fs: MarkdownFs,
    readonly location = `./${BRAND.dataDir}`,
  ) {
    fs.watch?.((path) => {
      const t = this.selfWrites.get(path);
      if (t && Date.now() - t < 1500) return;
      this.external.queue(path);
    });
  }

  private async put(path: string, text: string) {
    this.selfWrites.set(path, Date.now());
    await this.fs.write(path, text);
  }

  /** A new numbered file under a number nobody else has (createNumbered.ts). */
  private putNew<T>(make: () => Promise<NumberedFile<T>>): Promise<T> {
    return createNumbered(this.fs, make, (path) => this.selfWrites.set(path, Date.now()));
  }

  private async readMap(mapId: string): Promise<MapDoc> {
    return parseMapFile(mapId, await this.fs.read(`${mapId}/map.md`));
  }

  private async writeMap(m: MapDoc) {
    await this.put(`${m.id}/map.md`, serializeMapFile(m));
  }

  private async readTicket(mapId: string, id: string) {
    return parseTicket(await this.fs.read(`${mapId}/tickets/${id}.md`));
  }

  private async writeTicket(mapId: string, t: Ticket) {
    await this.put(`${mapId}/tickets/${t.id}.md`, serializeTicket({ ...t, updatedAt: Date.now() }));
  }

  async listMaps() {
    const files = await this.fs.list();
    const ids = files.filter((f) => /^[^/]+\/map\.md$/.test(f)).map((f) => f.split('/')[0]);
    return Promise.all(
      ids.map(async (id) => {
        const m = await this.readMap(id);
        return { id, key: m.key, title: m.title };
      }),
    );
  }

  async loadMap(mapId: string): Promise<MapSnapshot> {
    const files = await this.fs.list();
    const map = await this.readMap(mapId);
    const ticketFiles = files.filter((f) => f.startsWith(`${mapId}/tickets/`));
    const tickets = await Promise.all(ticketFiles.map(async (f) => parseTicket(await this.fs.read(f))));
    return { map, tickets: tickets.sort((a, b) => a.createdAt - b.createdAt) };
  }

  async createMap(input: MapInput) {
    const n = await nextNumber(this.fs);
    const slug = trailSlug(input.title, n);
    const map: MapDoc = {
      id: slug,
      key: `#${n}`,
      title: input.title,
      mode: input.mode ?? DEFAULT_MAP_MODE,
      ...(input.verification ? { verification: input.verification } : {}),
      sections: input.sections,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.writeMap(map);
    this.events.emit({ kind: 'map.created', mapId: slug, at: Date.now() });
    return map;
  }

  private async editMap(mapId: string, edit: (m: MapDoc) => MapDoc, event: TrackerEvent) {
    await this.writeMap({ ...edit(await this.readMap(mapId)), updatedAt: Date.now() });
    this.events.emit(event);
  }

  setMapMode(mapId: string, mode: MapMode) {
    return this.editMap(mapId, (m) => ({ ...m, mode }), { kind: 'map.mode', mapId, mode, at: Date.now() });
  }

  setMapMeta(mapId: string, patch: MapMetaPatch) {
    return this.editMap(mapId, (m) => withMapMeta(m, patch), { kind: 'map.updated', mapId, at: Date.now() });
  }

  updateMapSections(mapId: string, patch: Partial<MapSections>) {
    const section = Object.keys(patch)[0] as keyof MapSections;
    return this.editMap(mapId, (m) => ({ ...m, sections: { ...m.sections, ...patch } }), {
      kind: 'map.updated',
      mapId,
      section,
      at: Date.now(),
    });
  }

  async createTicket(mapId: string, input: { title: string; type: TicketType; body: string; hitl?: boolean }) {
    const t = await this.putNew(() => newTicketFile(this.fs, mapId, input));
    this.events.emit({ kind: 'ticket.created', mapId, ticketId: t.id, at: Date.now() });
    return t;
  }

  async addBlocking(mapId: string, blockerId: string, blockedId: string) {
    const t = await this.readTicket(mapId, blockedId);
    if (!t.blockedBy.includes(blockerId))
      await this.writeTicket(mapId, { ...t, blockedBy: [...t.blockedBy, blockerId] });
    this.events.emit({ kind: 'edge.added', mapId, blockerId, blockedId, at: Date.now() });
  }

  private async update(mapId: string, ticketId: string, change: (t: Ticket) => Ticket) {
    await this.writeTicket(mapId, change(await this.readTicket(mapId, ticketId)));
  }

  async removeBlocking(mapId: string, blockerId: string, blockedId: string) {
    await this.update(mapId, blockedId, (t) => withoutBlocker(t, blockerId));
    this.events.emit({ kind: 'edge.removed', mapId, blockerId, blockedId, at: Date.now() });
  }

  async editTicket(mapId: string, ticketId: string, edit: TicketEdit) {
    await this.update(mapId, ticketId, (t) => withEdit(t, edit));
    this.events.emit({ kind: 'ticket.updated', mapId, ticketId, at: Date.now() });
  }

  async reopen(mapId: string, ticketId: string) {
    await this.update(mapId, ticketId, reopened);
    this.events.emit({ kind: 'ticket.updated', mapId, ticketId, at: Date.now() });
  }

  async assign(mapId: string, ticketId: string, assignee: string | null) {
    await this.update(mapId, ticketId, (t) => ({ ...t, assignee: assignee ?? undefined }));
    this.events.emit(
      assignee
        ? { kind: 'ticket.claimed', mapId, ticketId, assignee, at: Date.now() }
        : { kind: 'ticket.released', mapId, ticketId, at: Date.now() },
    );
  }

  async comment(mapId: string, ticketId: string, author: string, body: string) {
    await this.update(mapId, ticketId, (t) => ({
      ...t,
      comments: [...t.comments, { id: `c${t.comments.length}`, author, body, createdAt: Date.now() }],
    }));
    this.events.emit({ kind: 'ticket.commented', mapId, ticketId, at: Date.now() });
  }

  async close(mapId: string, ticketId: string, reason: 'completed' | 'not_planned') {
    await this.update(mapId, ticketId, (t) => ({ ...t, state: 'closed', closeReason: reason, closedAt: Date.now() }));
    this.events.emit({ kind: 'ticket.closed', mapId, ticketId, reason, at: Date.now() });
  }

  async setMeta(mapId: string, ticketId: string, patch: TicketMetaPatch) {
    await this.update(mapId, ticketId, (t) => withMeta(t, patch));
    this.events.emit({ kind: 'ticket.updated', mapId, ticketId, at: Date.now() });
  }

  async listDecisions(mapId: string): Promise<DecisionRecord[]> {
    const files = (await this.fs.list()).filter((f) => f.startsWith(`${mapId}/decisions/`));
    return Promise.all(
      files.map(async (f) => {
        const text = await this.fs.read(f);
        const d = { ...parseDecision(text), mapId };
        if (!this.external.knows(f)) this.external.remember(f, text, d.supersededBy);
        return d;
      }),
    );
  }

  async createDecision(mapId: string, input: DecisionInput) {
    const d = await this.putNew(async () => {
      const file = await newDecisionFile(this.fs, mapId, input);
      this.external.remember(file.path, file.text);
      return file;
    });
    this.events.emit({ kind: 'decision.recorded', mapId, decisionId: d.id, ticketId: d.ticketId, at: Date.now() });
    return d;
  }

  async markSuperseded(mapId: string, decisionId: string, supersededBy: string) {
    const path = `${mapId}/decisions/${decisionId}.md`;
    const d = parseDecision(await this.fs.read(path));
    const text = serializeDecision({ ...d, mapId, supersededBy });
    this.external.remember(path, text, supersededBy);
    await this.put(path, text);
    this.events.emit({ kind: 'decision.superseded', mapId, decisionId, supersededBy, at: Date.now() });
  }

  subscribe(listener: (e: TrackerEvent) => void) {
    return this.events.on(listener);
  }
}
