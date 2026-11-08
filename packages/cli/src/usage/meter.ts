import os from 'node:os';
import path from 'node:path';
import type { SessionUsage, UsageSource } from '@teamtrail/core';
import { claudeCandidates, findCodexRollout } from './logLocations';
import { LogFile, claudeTranscriptParser, codexRolloutParser, type UsageEvent } from './logs';
import { ls, size, tail } from './quietFs';

export { claudeProjectDirName } from './logLocations';

export interface MeterOptions {
  /** Tracker folder, for Claude Code session links written by `teamtrail hook claude`. */
  root: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  home?: string;
}

type Meta = Record<string, unknown> | undefined;

/**
 * Real model usage of the agent this MCP server is connected to, read from the
 * agent's own local logs:
 *
 * - Claude Code: the session transcript. Each MCP call carries
 *   `_meta["claudecode/toolUseId"]`; the transcript holding that `tool_use` id
 *   is this agent's. Candidates come from the SessionStart hook installed by
 *   `teamtrail connect claude`, then `$CLAUDE_CODE_SESSION_ID`, then the newest
 *   transcripts of the project.
 * - Codex: the rollout file of the thread named by `_meta.threadId`.
 *
 * `measure(from, to)` sums the calls logged in a time window, so usage lands on
 * the teamtrail session (and its ticket) that was open while it was spent.
 */
export class UsageMeter {
  private files = new Map<string, LogFile>();
  private events = new Map<string, UsageEvent>();
  private source?: Exclude<UsageSource, 'reported'>;
  /** The latest model call of the agent's own log (not a subagent's): the model it runs on now. */
  private latest?: { at: number; model: string };
  private threadId?: string;
  /** Claude Code tool_use ids of recent calls not yet found in an attached transcript. */
  private toolUses: string[] = [];
  /** Candidate transcripts already searched, by size and pending ids, so unchanged files are not read again. */
  private checked = new Map<string, string>();
  private env: NodeJS.ProcessEnv;
  private cwd: string;
  private home: string;

  constructor(private opts: MeterOptions) {
    this.env = opts.env ?? process.env;
    this.cwd = opts.cwd ?? process.cwd();
    this.home = opts.home ?? os.homedir();
  }

  /** Log files read so far, with their source. */
  get attached() {
    return { source: this.source, files: [...this.files.keys()] };
  }

  /** Look at the `_meta` of an incoming MCP tool call; returns the agent's id for the call, if it sent one. */
  noteCall(meta: Meta): string | undefined {
    const codexMeta = meta?.['x-codex-turn-metadata'] as Record<string, unknown> | undefined;
    const thread = (meta?.threadId ?? codexMeta?.thread_id ?? codexMeta?.session_id) as string | undefined;
    if (typeof thread === 'string' && thread !== this.threadId) {
      const file = findCodexRollout(thread, this.env, this.home);
      if (file) {
        this.threadId = thread;
        this.attach(file, 'codex');
      }
    }
    const toolUse = meta?.['claudecode/toolUseId'];
    if (typeof toolUse === 'string') {
      this.toolUses = [...this.toolUses.slice(-31), toolUse];
      this.resolveClaude();
      return toolUse;
    }
    return typeof meta?.callId === 'string' ? meta.callId : undefined;
  }

  /** The model the agent runs on now: the one of its latest model call, once a log is attached. */
  model(): string | undefined {
    this.resolveClaude();
    if (this.files.size) this.poll();
    return this.latest?.model;
  }

  /** When the model call that issued tool call `callId` began, once its log record is read. */
  issuedAt(callId: string) {
    for (const f of this.files.values()) {
      const at = f.parser.calls.get(callId);
      if (at !== undefined) return at;
    }
    return undefined;
  }

  private attach(file: string, source: Exclude<UsageSource, 'reported'>) {
    if (this.files.has(file)) return;
    this.source = source;
    this.files.set(file, new LogFile(file, source === 'codex' ? codexRolloutParser() : claudeTranscriptParser()));
  }

  private poll() {
    for (const [file, f] of this.files) {
      const own = path.basename(path.dirname(file)) !== 'subagents';
      for (const e of f.read()) {
        if (own && e.model && (!this.latest || e.at >= this.latest.at)) this.latest = { at: e.at, model: e.model };
        const prev = this.events.get(e.key);
        this.events.set(
          e.key,
          prev
            ? {
                ...e,
                at: prev.at,
                input: Math.max(prev.input, e.input),
                output: Math.max(prev.output, e.output),
                costUsd: Math.max(prev.costUsd, e.costUsd),
              }
            : e,
        );
      }
    }
    if (this.source === 'claude-code') this.attachSubagents();
  }

  /** Subagent (Task) transcripts sit next to the main one, under `<session>/subagents/`. */
  private attachSubagents() {
    for (const file of [...this.files.keys()]) {
      if (path.basename(path.dirname(file)) === 'subagents') continue;
      const dir = path.join(file.replace(/\.jsonl$/, ''), 'subagents');
      for (const n of ls(dir)) if (n.endsWith('.jsonl')) this.attach(path.join(dir, n), 'claude-code');
    }
  }

  /**
   * Find the transcript holding the recent tool calls. Claude Code may write the
   * `tool_use` record only after the call reached us, so ids stay pending until seen.
   */
  private resolveClaude() {
    if (!this.toolUses.length) return;
    this.poll();
    const known = (id: string) => [...this.files.values()].some((f) => f.parser.calls.has(id));
    this.toolUses = this.toolUses.filter((id) => !known(id));
    if (!this.toolUses.length) return;
    const sig = this.toolUses.join();
    for (const f of claudeCandidates(this.opts.root, this.env, this.cwd, this.home)) {
      if (this.files.has(f)) continue;
      const seen = `${size(f)}:${sig}`;
      if (this.checked.get(f) === seen) continue;
      this.checked.set(f, seen);
      const text = tail(f);
      if (!this.toolUses.some((id) => text.includes(id))) continue;
      this.attach(f, 'claude-code');
      this.poll();
      this.toolUses = this.toolUses.filter((id) => !known(id));
      if (!this.toolUses.length) return;
    }
  }

  /**
   * Usage logged in `(from, to]`; undefined while no log is attached (fall back to
   * what the agent reports). With `openedBy` (the tool call that opened the window)
   * the window starts when the model call that issued it began, but not before
   * `notBefore`; `from` applies until that call's record is read.
   */
  measure(
    from: number,
    to = Date.now(),
    opts: { openedBy?: string; notBefore?: number } = {},
  ): SessionUsage | undefined {
    this.resolveClaude();
    if (!this.files.size || !this.source) return undefined;
    this.poll();
    const issued = opts.openedBy ? this.issuedAt(opts.openedBy) : undefined;
    if (issued !== undefined) from = Math.max(issued, opts.notBefore ?? -Infinity);
    const u = { inputTokens: 0, outputTokens: 0, costUsd: 0, cachedInputTokens: 0 };
    const models = new Set<string>();
    for (const e of this.events.values()) {
      if (e.at <= from || e.at > to) continue;
      u.inputTokens += e.input;
      u.outputTokens += e.output;
      u.cachedInputTokens += e.cacheRead;
      u.costUsd += e.costUsd;
      if (e.model) models.add(e.model);
    }
    return { ...u, costUsd: Math.round(u.costUsd * 1e6) / 1e6, source: this.source, models: [...models].sort() };
  }
}
