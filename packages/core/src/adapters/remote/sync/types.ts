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
  /** Queued writes the tracker refused for good, newest last (a few at most); kept until this process ends. */
  dropped?: DroppedWrite[];
  rate?: RateInfo;
}

/** A queued write the tracker refused for good (a deleted issue, revoked access, a ticket claimed meanwhile). */
export interface DroppedWrite {
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
