import type { MapMetaPatch, TicketMetaPatch } from '../../../model/lifecycle';
import type { DecisionRecord, MapMode, MapSections, MapSnapshot, TrackerEvent } from '../../../model/types';
import type { TicketEdit } from '../../adapter';
import type { RateInfo } from '../http';

export type SyncState = 'connecting' | 'online' | 'offline' | 'rate-limited' | 'auth-error';

/** Connection health of a remote tracker, shown next to the connector in Settings. */
export interface SyncStatus {
  state: SyncState;
  /** Writes made while offline or rate limited, sent in order once the tracker answers again. */
  queued: number;
  lastSyncAt?: number;
  /** While rate limited: when requests resume (epoch ms). */
  resetAt?: number;
  /** Last failure, cleared on the next success. */
  error?: string;
  /**
   * Queued writes this process saw the tracker refuse for good, newest last (a few at most). One kept for the human
   * leaves once they retry or discard it, from any process; one that couldn't be kept stays until this process ends.
   */
  dropped?: DroppedWrite[];
  rate?: RateInfo;
}

/** A queued write the tracker refused for good (a deleted issue, revoked access, a ticket claimed meanwhile). */
export interface DroppedWrite {
  /** The write's id, when it was kept for the human (refusedWrites.ts). */
  id?: string;
  label: string;
  error: string;
  at: number;
}

export interface SyncOptions {
  /** Poll interval while someone is subscribed. */
  pollMs?: number;
  maxBackoffMs?: number;
  /** How long a cached trail is trusted when nothing is polling (e.g. an agent-only server). */
  ttlMs?: number;
  /** How often every cached trail and the trail list are read again while polling (default five minutes). */
  resyncMs?: number;
  now?: () => number;
  /** No timers: the caller drives polling and queue flushes with `tick()` (tests). */
  manual?: boolean;
  /** Keeps queued writes across restarts; without it they live in memory only. */
  outbox?: OutboxStore;
  /** Who is making the writes, kept on each queued one (an agent's own refused write is told to it). */
  author?: () => WriteAuthor | undefined;
  /** Where a queued write the tracker refused for good is kept for the human (refusedWrites.ts). */
  refused?: RefusedSink;
}

/** Who made a write: as shown to the human, and the agent connection to tell when it is refused. */
export interface WriteAuthor {
  by: string;
  origin?: string;
}

/** Takes a queued write the tracker refused for good, with the tracker's reason. */
export interface RefusedSink {
  add(input: { write: QueuedWrite; error: string; at: number }): void;
  /** The ids of the refused writes still waiting for the human's Retry or Discard. */
  kept?(): ReadonlySet<string>;
}

/**
 * A queued write the tracker refused for good, kept on this machine until the trail lead retries or discards it.
 * `key` is the outbox key of the tracker target it was for (outboxFile.ts `outboxKey`).
 */
export interface RefusedWrite {
  write: QueuedWrite;
  tracker: 'github' | 'linear';
  key: string;
  error: string;
  at: number;
  /** The issue on the tracker's website, when Teamtrail knows it. */
  url?: string;
}

/** A write that can wait for the tracker, as plain data so a later run can send it. */
export type QueuedChange =
  | { kind: 'mode'; mode: MapMode }
  | { kind: 'archived'; archived: boolean }
  /** `patch`: the sections changed, laid over the trail as it is in the tracker when sent (older writes lack it). */
  | { kind: 'sections'; sections: MapSections; patch?: Partial<MapSections> }
  | { kind: 'mapMeta'; patch: MapMetaPatch }
  | { kind: 'blocking'; blockerId: string; blockedId: string }
  | { kind: 'unblocking'; blockerId: string; blockedId: string }
  | { kind: 'edit'; ticketId: string; edit: TicketEdit }
  | { kind: 'reopen'; ticketId: string }
  /** `was`: the assignee the claim replaces (null: none); a different one in the tracker refuses it. */
  | { kind: 'claim'; ticketId: string; assignee?: string; was?: string | null }
  | { kind: 'meta'; ticketId: string; patch: TicketMetaPatch }
  | { kind: 'comment'; ticketId: string; author: string; body: string }
  | { kind: 'close'; ticketId: string; reason: 'completed' | 'not_planned' }
  | { kind: 'decision'; decision: DecisionRecord }
  | { kind: 'supersede'; decisionId: string; supersededBy: string };

export interface QueuedWrite {
  /** Unique per write; comments carry it in the tracker, so a replay can tell they already landed. */
  id: string;
  mapId: string;
  label: string;
  at: number;
  change: QueuedChange;
  /** May have reached the tracker already (the connection dropped mid-request, or a run exited mid-send): check before sending. */
  verify?: boolean;
  /** Who made it (`agent claude-05 via MCP`); missing for writes queued before it was kept. */
  by?: string;
  /** The agent connection that made it (AgentContext.origin), told if the tracker refuses it. */
  origin?: string;
}

/** Where queued writes survive a restart or crash (outboxFile.ts). */
export interface OutboxStore {
  /** Writes left unsent by earlier runs, oldest first; they now belong to this adapter. */
  load(): QueuedWrite[];
  /** The whole queue, after every change to it. */
  save(writes: QueuedWrite[]): void;
  /** Stop owning the queue; unsent writes wait for the next run. */
  release(): void;
}

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventInit = Without<TrackerEvent, 'at'>;

/** A trail as cached by a synced adapter. */
export interface CacheEntry {
  snap: MapSnapshot;
  decisions: DecisionRecord[];
  at: number;
}

/** A comment as a remote tracker writes it; `writeId` lets a queued write find it again. */
export interface RemoteComment {
  author: string;
  body: string;
  writeId: string;
}
