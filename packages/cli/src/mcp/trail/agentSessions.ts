import type { ActivityStream, SessionHandle, SessionMode, TranscriptEntry } from '@teamtrail/core';
import type { AgentOptions } from './types';

interface UsageWindow {
  s: SessionHandle;
  from: number;
  to?: number;
  openedBy?: string;
  notBefore?: number;
}

/** The sessions this agent process opens, their HITL transcripts, and their usage read from the agent's logs. */
export class AgentSessions {
  /** The last session opened; it may have ended. */
  current?: SessionHandle;
  /** Shared by every agent of this process: over HTTP one process hosts many agents, and session ids are files. */
  private static seq = 0;
  private transcripts = new Map<string, TranscriptEntry[]>();
  /**
   * Usage window of each session of this process: from the model call that
   * issued the tool call opening it (not before the previous session ended) to
   * its own end. Ended sessions are re-measured too, because the agent may write
   * its log after the call that ended the session.
   */
  private windows = new Map<string, UsageWindow>();
  private lastEnd?: number;
  /** Agent's id for the tool call being handled. */
  private currentCall?: string;
  private usagePoll?: ReturnType<typeof setInterval>;

  constructor(
    private activity: ActivityStream,
    private usage: AgentOptions['usage'],
    usagePollMs = 2000,
  ) {
    if (usage) {
      this.usagePoll = setInterval(() => this.measureAll(), usagePollMs);
      this.usagePoll.unref?.();
    }
  }

  start(agent: string, mode: SessionMode, mapId: string, ticketId?: string) {
    const s = this.activity.startSession({
      id: `s_${process.pid.toString(36)}_${(AgentSessions.seq++).toString(36)}`,
      agent,
      mode,
      mapId,
      ticketId,
    });
    this.current = s;
    this.transcripts.set(s.id, []);
    this.windows.set(s.id, { s, from: s.info.startedAt, openedBy: this.currentCall, notBefore: this.lastEnd });
    return s;
  }

  running() {
    return this.current?.info.status === 'running' ? this.current : undefined;
  }

  transcript(sessionId: string) {
    return this.transcripts.get(sessionId);
  }

  note(s: SessionHandle, from: TranscriptEntry['from'], author: string, text: string) {
    this.transcripts.get(s.id)?.push({ from, author, text, at: Date.now() });
  }

  /** `_meta` of an incoming tool call: tells the usage meter which agent log this process belongs to. */
  noteCall(meta: Record<string, unknown> | undefined) {
    this.currentCall = this.usage?.noteCall(meta);
  }

  /** Set a session's usage from the agent's logs. False when no log is available. */
  measure(s: SessionHandle) {
    const w = this.windows.get(s.id);
    const u = w && this.usage?.measure(w.from, w.to, { openedBy: w.openedBy, notBefore: w.notBefore });
    if (u) s.setUsage(u);
    return !!u;
  }

  /** Re-measure every session of this process ended in the last hour, and the running one. */
  measureAll() {
    if (!this.usage) return;
    for (const [id, w] of this.windows) {
      if (w.to && w.to < Date.now() - 3_600_000) this.windows.delete(id);
      else this.measure(w.s);
    }
  }

  end(ok: boolean, text?: string, signal?: boolean) {
    const s = this.running();
    if (s) {
      this.lastEnd = Date.now();
      const w = this.windows.get(s.id);
      if (w) w.to = this.lastEnd;
      this.measure(s);
      s.done(ok, text, { signal });
    }
    this.current = undefined;
  }

  stopPolling() {
    clearInterval(this.usagePoll);
  }
}
