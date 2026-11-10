import { acceptedSettingsFile } from '../adapters/remote/acceptedSettingsFile';
import { GitHubAdapter } from '../adapters/remote/github';
import { TrackerError } from '../adapters/remote/http';
import { LinearAdapter } from '../adapters/remote/linear';
import { orphanedWrites, outboxFile, outboxKey } from '../adapters/remote/outboxFile';
import type { SyncedAdapter } from '../adapters/remote/sync/syncedAdapter';
import type { RemoteKind } from '../adapters/remote/types';
import { resolveLinearKey, type ProjectTrackerConfig } from './trackerConfig';
import type { TrackerContext } from './trackerContext';

export const isKind = (k: string | undefined): k is RemoteKind => k === 'github' || k === 'linear';

/** Queued writes belong to one repo / team, so switching target never replays them into another. */
const queueKey = (cfg: ProjectTrackerConfig, kind: RemoteKind) =>
  kind === 'github'
    ? outboxKey('github', cfg.github?.repo)
    : outboxKey('linear', cfg.linear?.teamId, cfg.linear?.projectId);

/** One GitHub and one Linear adapter at most, built on first use from the project config and credentials. */
export function remoteAdapters(ctx: TrackerContext) {
  const { o, env, creds, project, apiUrl } = ctx;
  const adapters: Partial<Record<RemoteKind, Promise<SyncedAdapter>>> = {};
  const live: Partial<Record<RemoteKind, SyncedAdapter>> = {};

  async function build(kind: RemoteKind): Promise<SyncedAdapter> {
    const cfg = project.read();
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
        outbox: outboxFile(o.root, queueKey(cfg, 'github')),
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
      outbox: outboxFile(o.root, queueKey(cfg, 'linear')),
      accepted: acceptedSettingsFile(o.root, queueKey(cfg, 'linear')),
    });
  }

  function get(kind: RemoteKind) {
    adapters[kind] ??= build(kind).then(
      (a) => (live[kind] = a),
      (e) => {
        delete adapters[kind];
        throw e;
      },
    );
    return adapters[kind]!;
  }

  function reset(kind: RemoteKind) {
    live[kind]?.dispose();
    delete live[kind];
    delete adapters[kind];
    ctx.forgetGitHubToken();
  }

  return {
    get,
    reset,
    status: (k: RemoteKind) => (live[k] ? { ...live[k]!.status } : undefined),
    /** Writes an earlier run queued but never sent: start the adapter now so they replay (and show in Settings). */
    resumeQueued() {
      const cfg = project.read();
      if (isKind(cfg.active) && orphanedWrites(o.root, queueKey(cfg, cfg.active))) get(cfg.active).catch(() => {});
    },
    close() {
      for (const k of Object.keys(live) as RemoteKind[]) reset(k);
    },
  };
}

export type RemoteAdapters = ReturnType<typeof remoteAdapters>;
