import { uid } from '../lib/emitter';
import type { ModelTier } from '../model/modelTier';
import { STEPS, stepTag } from '../model/steps';
import type { ChatMessage, FeedEntry, PendingQuestion, SessionInfo, SessionMode, SessionUsage } from '../model/types';
import { addUsage, subUsage } from './usage';
import type { UsageLedger } from './usageLedger';

export interface SessionHandle {
  readonly id: string;
  readonly info: SessionInfo;
  step(n: number, detail?: string, ticketId?: string): void;
  log(text: string, level?: FeedEntry['level']): void;
  /** Post an agent message into the session's conversation. */
  say(text: string): void;
  /** Ask the human a question and wait for the answer. `extra` ranks it in the attention queue. */
  ask(text: string, suggestions?: string[], extra?: Pick<PendingQuestion, 'urgency' | 'blocks'>): Promise<string>;
  done(ok?: boolean, text?: string, opts?: { signal?: boolean }): void;
  /** Attach the session to a map created mid-session (chart). */
  bindMap(mapId: string): void;
  /** Add model usage reported by the agent. */
  usage(delta: SessionUsage): void;
  /** Replace the session's cumulative usage (measured from the agent's logs); the trail total moves by the difference. */
  setUsage(total: SessionUsage): void;
  /** The model the agent runs on and its tier, for model matching and the sessions list. */
  setModel(model: string | undefined, tier: ModelTier): void;
}

/** What a session handle reads and changes in its ActivityStream. */
export interface SessionHost {
  find(id: string): SessionInfo | undefined;
  patchSession(id: string, patch: Partial<SessionInfo>): void;
  push(e: Omit<FeedEntry, 'id' | 'at'>): void;
  chat(m: Omit<ChatMessage, 'id' | 'at'>): void;
  addPending(q: PendingQuestion): void;
  /** Drops the session's open questions. */
  dropPending(sessionId: string): void;
  awaitAnswer(questionId: string): Promise<string>;
  /** Adds to the trail's usage total without notifying subscribers; the session patch that follows does. */
  addMapUsage(mapId: string, delta: SessionUsage): void;
  ledger(): UsageLedger | undefined;
}

export function createSessionHandle(host: SessionHost, info: SessionInfo, mode: SessionMode): SessionHandle {
  const current = () => host.find(info.id) ?? info;
  const feed = (e: Omit<FeedEntry, 'id' | 'at' | 'source' | 'sessionId' | 'agent'>) =>
    host.push({ source: 'session', sessionId: info.id, agent: info.agent, ...e });
  return {
    id: info.id,
    get info() {
      return current();
    },
    step(n, detail, ticketId) {
      const label = STEPS[mode][n - 1];
      host.patchSession(info.id, { step: n, stepLabel: label, ...(ticketId ? { ticketId } : {}) });
      feed({
        tag: stepTag(mode, n),
        level: 'step',
        text: detail ? `${label}: ${detail}` : label,
        ticketId: ticketId ?? current().ticketId,
      });
    },
    log(text, level = 'info') {
      feed({ level, text, ticketId: current().ticketId });
    },
    say(text) {
      host.chat({ sessionId: info.id, ticketId: current().ticketId, from: 'agent', author: info.agent, text });
    },
    ask(text, suggestions, extra) {
      const q: PendingQuestion = {
        id: uid('q'),
        sessionId: info.id,
        mapId: info.mapId,
        ticketId: current().ticketId,
        agent: info.agent,
        text,
        suggestions,
        at: Date.now(),
        ...(extra?.urgency ? { urgency: extra.urgency } : {}),
        ...(extra?.blocks?.length ? { blocks: extra.blocks } : {}),
      };
      host.chat({
        sessionId: info.id,
        ticketId: q.ticketId,
        from: 'agent',
        author: info.agent,
        text,
        questionId: q.id,
      });
      host.addPending(q);
      host.patchSession(info.id, { waitingOn: q.id });
      feed({ level: 'alert', ticketId: q.ticketId, text: 'Decision request · waiting on you', signal: true });
      return host.awaitAnswer(q.id);
    },
    done(ok = true, text, opts) {
      host.patchSession(info.id, { status: ok ? 'done' : 'failed', endedAt: Date.now(), waitingOn: undefined });
      host.dropPending(info.id);
      feed({
        level: ok ? 'ok' : 'alert',
        text: text ?? (ok ? 'Session closed' : 'Session aborted'),
        signal: opts?.signal,
      });
    },
    bindMap(mapId) {
      const used = current().usage;
      if (used) {
        host.addMapUsage(mapId, used);
        host.ledger()?.add(mapId, used, info.id);
      }
      host.patchSession(info.id, { mapId });
    },
    usage(delta) {
      const mapId = current().mapId;
      host.ledger()?.add(mapId, delta, info.id);
      host.addMapUsage(mapId, delta);
      const prev = current().usage;
      host.patchSession(info.id, { usage: { ...addUsage(prev, delta), source: delta.source ?? prev?.source } });
    },
    setUsage(total) {
      const prev = current().usage;
      const d = subUsage(total, prev);
      const same =
        !d.inputTokens &&
        !d.outputTokens &&
        !d.costUsd &&
        !d.cachedInputTokens &&
        prev?.source === total.source &&
        `${prev?.models}` === `${total.models}`;
      if (same) return;
      const mapId = current().mapId;
      if (d.inputTokens > 0 || d.outputTokens > 0 || d.costUsd > 0) host.ledger()?.add(mapId, d, info.id);
      host.addMapUsage(mapId, d);
      host.patchSession(info.id, { usage: total });
    },
    setModel(model, tier) {
      const now = current();
      if (now.model === model && now.tier === tier) return;
      host.patchSession(info.id, { model, tier });
    },
  };
}
