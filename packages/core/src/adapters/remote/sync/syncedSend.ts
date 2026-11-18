import type { DecisionRecord, MapDoc, MapMode, Ticket, TicketType } from '../../../model/types';
import { OperationError } from '../../../planning/operations/operationError';
import type { MapInput } from '../../adapter';
import { withMapMeta } from '../../mapMeta';
import { reopened, withEdit } from '../../ticketEdits';
import { withMeta } from '../../ticketMeta';
import { sectionsAfter, ticketOf } from './queuedWrites';
import { SyncedRefresh } from './syncedRefresh';
import type { CacheEntry, QueuedChange, QueuedWrite, RemoteComment } from './types';

/** Writes that rewrite a whole issue body: built on the issue as the tracker has it now, never on the cache. */
const REWRITES = new Set<QueuedChange['kind']>(['edit', 'claim', 'meta', 'sections', 'mapMeta']);

/**
 * A claim that would overwrite someone else's: the tracker names an assignee who is neither the one the claim
 * replaces nor the one it sets (a teammate or another agent claimed it meanwhile).
 */
function claimConflict(current: CacheEntry, c: QueuedChange): string | undefined {
  if (c.kind !== 'claim' || c.was === undefined) return undefined;
  const t = current.snap.tickets.find((x) => x.id === c.ticketId);
  const now = t?.assignee;
  if (!t || !now || now === c.was || now === c.assignee) return undefined;
  return `${t.key} was claimed by ${now} in the tracker meanwhile`;
}

/**
 * The remote primitives each tracker supplies, and how one queueable write is sent with them. A write that rewrites
 * an issue body (a claim, a status, an edit, the trail's sections or settings) is laid over the issue as the tracker
 * has it at that moment, read just before, so a teammate's edit made since the last poll is kept, and a claim that
 * someone else made meanwhile is refused rather than overwritten. Offline drains send the same way.
 */
export abstract class SyncedSend extends SyncedRefresh {
  protected abstract remoteCreateMap(input: MapInput & { mode: MapMode }): Promise<MapDoc>;
  protected abstract remoteCreateTicket(
    map: MapDoc,
    input: { title: string; type: TicketType; body: string; hitl?: boolean },
  ): Promise<Ticket>;
  protected abstract remoteAddBlocking(map: MapDoc, blocker: Ticket, blocked: Ticket): Promise<void>;
  /** Drop the relation; a relation that is already gone is not an error. */
  protected abstract remoteRemoveBlocking(map: MapDoc, blocker: Ticket, blocked: Ticket): Promise<void>;
  /** Persist the title and body (with its `ticketMeta`) of an already-edited ticket. */
  protected abstract remoteEditTicket(map: MapDoc, t: Ticket): Promise<void>;
  protected abstract remoteReopen(map: MapDoc, t: Ticket): Promise<void>;
  /** Persist the claim and status (`ticketMeta`) of an already-updated ticket. */
  /** `confirm`: the trail lead set this ticket's settings (TicketMetaPatch.confirm); any other write never accepts them. */
  protected abstract remoteSetMeta(map: MapDoc, t: Ticket, o?: { confirm?: boolean }): Promise<void>;
  /** `c.writeId` must be readable back as the comment's `writeId`. */
  protected abstract remoteComment(map: MapDoc, t: Ticket, c: RemoteComment): Promise<void>;
  protected abstract remoteClose(map: MapDoc, t: Ticket, reason: 'completed' | 'not_planned'): Promise<void>;
  protected abstract remoteUpdateMap(map: MapDoc, o?: { confirm?: boolean }): Promise<void>;
  protected abstract remoteSetMode(map: MapDoc, mode: MapMode): Promise<void>;
  /** Adds or removes the ARCHIVED_LABEL on the trail issue. */
  protected abstract remoteSetArchived(map: MapDoc, archived: boolean): Promise<void>;
  /** Post a decision record on its ticket, or on the trail when it has none. */
  protected abstract remotePostDecision(map: MapDoc, d: DecisionRecord, ticket?: Ticket): Promise<void>;
  protected abstract remoteUpdateDecision(map: MapDoc, d: DecisionRecord): Promise<void>;

  /**
   * Sends a queueable write. Body rewrites read the trail from the tracker first and return it (as it was before
   * the write); other writes read tickets and decisions from `e`, the cached trail before the write is applied.
   */
  protected async send(e: CacheEntry, w: QueuedWrite): Promise<CacheEntry | undefined> {
    if (!REWRITES.has(w.change.kind)) return void (await this.sendOn(e, w));
    const current = { ...(await this.fetchMap(w.mapId)), at: this.now() };
    const conflict = claimConflict(current, w.change);
    if (conflict) throw new OperationError(conflict);
    await this.sendOn(current, w);
    return current;
  }

  private sendOn(e: CacheEntry, w: QueuedWrite): Promise<unknown> {
    const c = w.change;
    const map = e.snap.map;
    switch (c.kind) {
      case 'mode':
        return this.remoteSetMode(map, c.mode);
      case 'archived':
        return this.remoteSetArchived(map, c.archived);
      case 'sections':
        return this.remoteUpdateMap({ ...map, sections: sectionsAfter(map.sections, c) });
      case 'mapMeta':
        return this.remoteUpdateMap(withMapMeta(map, c.patch), { confirm: !!c.patch.confirm });
      case 'blocking':
        return this.remoteAddBlocking(map, ticketOf(e, c.blockerId), ticketOf(e, c.blockedId));
      case 'unblocking':
        return this.remoteRemoveBlocking(map, ticketOf(e, c.blockerId), ticketOf(e, c.blockedId));
      case 'edit':
        return this.remoteEditTicket(map, withEdit(ticketOf(e, c.ticketId), c.edit));
      case 'reopen':
        return this.remoteReopen(map, reopened(ticketOf(e, c.ticketId)));
      case 'claim':
        return this.remoteSetMeta(map, { ...ticketOf(e, c.ticketId), assignee: c.assignee });
      case 'meta':
        return this.remoteSetMeta(map, withMeta(ticketOf(e, c.ticketId), c.patch), { confirm: !!c.patch.confirm });
      case 'comment':
        return this.remoteComment(map, ticketOf(e, c.ticketId), { author: c.author, body: c.body, writeId: w.id });
      case 'close':
        return this.remoteClose(map, ticketOf(e, c.ticketId), c.reason);
      case 'decision':
        return this.remotePostDecision(
          map,
          c.decision,
          c.decision.ticketId ? e.snap.tickets.find((t) => t.id === c.decision.ticketId) : undefined,
        );
      case 'supersede': {
        const d = e.decisions.find((x) => x.id === c.decisionId);
        if (!d) throw new OperationError(`decision ${c.decisionId} not found in ${w.mapId}`);
        return this.remoteUpdateDecision(map, { ...d, supersededBy: c.supersededBy });
      }
    }
  }
}
