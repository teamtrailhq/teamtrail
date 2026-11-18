import { createHash } from 'node:crypto';
import { acceptedSettingsFile } from '../adapters/remote/acceptedSettingsFile';
import { GitHubAdapter } from '../adapters/remote/github';
import { TrackerError } from '../adapters/remote/http';
import { LinearAdapter } from '../adapters/remote/linear';
import { orphanedWrites, outboxDir, outboxFile, outboxKey } from '../adapters/remote/outboxFile';
import type { SyncedAdapter } from '../adapters/remote/sync/syncedAdapter';
import type { RemoteKind } from '../adapters/remote/types';
import { Emitter } from '../lib/emitter';
import { resolveLinearKey, type ProjectTrackerConfig } from './trackerConfig';
import type { TrackerContext } from './trackerContext';
import { trackerTargetLabel } from './trackerPin';

export const isKind = (k: string | undefined): k is RemoteKind => k === 'github' || k === 'linear';

/** Queued writes belong to one repo / team, so switching target never replays them into another. */
const queueKey = (cfg: ProjectTrackerConfig, kind: RemoteKind) =>
  kind === 'github'
    ? outboxKey('github', cfg.github?.repo)
    : outboxKey('linear', cfg.linear?.teamId, cfg.linear?.projectId);

/**
 * The repo or team an adapter writes to and the credential it uses, as a hash: an adapter built for another
 * one is replaced, so a process that keeps running (an MCP server) follows Settings rather than keep the old.
 */
async function identityOf(ctx: TrackerContext, kind: RemoteKind) {
  const cfg = ctx.pin.read().config;
  const token =
    kind === 'github' ? (await ctx.githubToken())?.token : resolveLinearKey(ctx.creds.read(), ctx.env)?.token;
  return createHash('sha256')
    .update(`${cfg.active}\n${queueKey(cfg, kind)}\n${token ?? ''}`)
    .digest('hex');
}

/**
 * One GitHub and one Linear adapter at most, built on first use from the project config and credentials, and
 * built again when the tracker approved here, its repo or team, or the token changes (in this process or another).
 */
export function remoteAdapters(ctx: TrackerContext) {
  const { o, env, creds, pin, apiUrl } = ctx;
  const adapters: Partial<Record<RemoteKind, { identity: string; adapter: Promise<SyncedAdapter> }>> = {};
  const live: Partial<Record<RemoteKind, SyncedAdapter>> = {};
  const replaced = new Emitter<RemoteKind>();
  let closed = false;
  /** Outside the repo: only this machine's Teamtrail queues writes there. */
  const queueDir = outboxDir(o.root, ctx.configDir);

  /** Only the tracker approved on this machine is ever built: the token goes nowhere else. */
  async function build(kind: RemoteKind): Promise<SyncedAdapter> {
    const cfg = pin.read().config;
    if (cfg.active !== kind)
      throw new TrackerError(
        'invalid',
        `${kind === 'github' ? 'GitHub' : 'Linear'} is not the tracker approved on this machine (${trackerTargetLabel(cfg)}); connect it in Settings`,
      );
    if (kind === 'github') {
      if (!cfg.github?.repo) throw new TrackerError('invalid', 'GitHub is not connected; connect it in Settings');
      const t = await ctx.githubToken();
      if (!t)
        throw new TrackerError(
          'auth',
          'No GitHub token: run `gh auth login`, set GITHUB_TOKEN, or paste one in Settings',
        );
      return new GitHubAdapter({
        repo: cfg.github.repo,
        token: t.token,
        apiUrl: apiUrl.github,
        fetch: o.fetch,
        outbox: outboxFile(queueDir, queueKey(cfg, 'github')),
        accepted: acceptedSettingsFile(o.root, queueKey(cfg, 'github')),
      });
    }
    if (!cfg.linear?.teamId) throw new TrackerError('invalid', 'Linear is not connected; connect it in Settings');
    const k = resolveLinearKey(creds.read(), env);
    if (!k) throw new TrackerError('auth', 'No Linear API key: set LINEAR_API_KEY or paste one in Settings');
    const display = [cfg.linear.teamKey, cfg.linear.projectName].filter(Boolean).join(' · ') || undefined;
    return new LinearAdapter({
      apiKey: k.token,
      teamId: cfg.linear.teamId,
      projectId: cfg.linear.projectId,
      display,
      apiUrl: apiUrl.linear,
      fetch: o.fetch,
      outbox: outboxFile(queueDir, queueKey(cfg, 'linear')),
      accepted: acceptedSettingsFile(o.root, queueKey(cfg, 'linear')),
    });
  }

  async function get(kind: RemoteKind): Promise<SyncedAdapter> {
    const identity = await identityOf(ctx, kind);
    const known = adapters[kind];
    if (known && known.identity !== identity) reset(kind);
    const kept = adapters[kind];
    if (kept) return kept.adapter;
    const entry = { identity, adapter: build(kind) };
    entry.adapter = entry.adapter.then(
      (a) => {
        // replaced while it was being built: never left polling with the old target or token
        if (adapters[kind] !== entry) return (a.dispose(), get(kind));
        return (live[kind] = a);
      },
      (e) => {
        if (adapters[kind] === entry) delete adapters[kind];
        throw e;
      },
    );
    adapters[kind] = entry;
    return entry.adapter;
  }

  /** Drops the adapter (its queued writes stay in the outbox); event streams on it move to the next one. */
  function reset(kind: RemoteKind) {
    const had = !!adapters[kind];
    live[kind]?.dispose();
    delete live[kind];
    delete adapters[kind];
    ctx.forgetGitHubToken();
    if (had && !closed) replaced.emit(kind);
  }

  return {
    get,
    reset,
    /** Called with the kind whenever its adapter is dropped, for streams to move to the new one. */
    onReplaced: (fn: (kind: RemoteKind) => void) => replaced.on(fn),
    status: (k: RemoteKind) => (live[k] ? { ...live[k]!.status } : undefined),
    /** Writes an earlier run queued but never sent: start the adapter now so they replay (and show in Settings). */
    resumeQueued() {
      const cfg = pin.read().config;
      if (isKind(cfg.active) && orphanedWrites(queueDir, queueKey(cfg, cfg.active))) get(cfg.active).catch(() => {});
    },
    close() {
      closed = true;
      for (const k of Object.keys(live) as RemoteKind[]) reset(k);
    },
  };
}

export type RemoteAdapters = ReturnType<typeof remoteAdapters>;
