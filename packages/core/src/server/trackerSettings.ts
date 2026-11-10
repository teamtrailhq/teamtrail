import { testGitHub } from '../adapters/remote/github';
import { testLinear } from '../adapters/remote/linear';
import type {
  PendingTracker,
  TrackerConnectRequest,
  TrackerSettings,
  TrackerTestRequest,
  TrackerTestResult,
} from '../adapters/remote/types';
import { journalFile } from '../history/journalFile';
import { TRUST_JOURNAL } from '../model/lifecycle';
import type { GitHubLookups } from './githubLookups';
import type { GitHubSignIn } from './githubSignIn';
import { BadRequest } from './http';
import type { LinearLookups } from './linearLookups';
import type { RemoteAdapters } from './remoteAdapters';
import { resolveLinearKey, type ProjectTrackerConfig } from './trackerConfig';
import type { TrackerContext } from './trackerContext';
import { trackerTargetKey, trackerTargetLabel } from './trackerPin';

const pendingOf = (approved: ProjectTrackerConfig, asked: ProjectTrackerConfig): PendingTracker => ({
  target: trackerTargetKey(asked),
  label: trackerTargetLabel(asked),
  approved: trackerTargetLabel(approved),
});

/** Reading, testing and switching the project's tracker connection. */
export function trackerSettings(deps: {
  ctx: TrackerContext;
  remotes: RemoteAdapters;
  lookups: GitHubLookups;
  linear: LinearLookups;
  signIn: GitHubSignIn;
}) {
  const { ctx, remotes, lookups, linear, signIn } = deps;
  const { o, env, creds, project, pin, apiUrl } = ctx;

  /** Saves the tracker the human chose on this machine: the file teammates share, and this machine's pin. */
  function choose(cfg: ProjectTrackerConfig) {
    project.write(cfg);
    pin.approve(cfg);
  }

  async function settings(): Promise<TrackerSettings> {
    const approved = pin.read();
    const cfg = approved.config;
    const detected = ctx.detectedRepo();
    const [gh, repo, account, viewer] = await Promise.all([
      ctx.githubToken(),
      detected,
      lookups.account(),
      linear.viewer(),
    ]);
    return {
      active: cfg.active,
      github: {
        repo: cfg.github?.repo,
        detectedRepo: repo,
        auth: gh?.source ?? null,
        account,
        signIn: { available: signIn.available(), signedIn: signIn.signedIn() },
        status: remotes.status('github'),
      },
      linear: {
        ...cfg.linear,
        auth: resolveLinearKey(creds.read(), env)?.source ?? null,
        viewer,
        status: remotes.status('linear'),
      },
      ...(approved.pending ? { pending: pendingOf(approved.config, approved.pending) } : {}),
    };
  }

  async function test(req: TrackerTestRequest): Promise<TrackerTestResult> {
    const cfg = pin.read().config;
    if (req.kind === 'github') {
      const token = req.token?.trim() || (await ctx.githubToken())?.token;
      if (!token)
        return { ok: false, code: 'auth', error: 'No GitHub token found. Run `gh auth login`, or paste a token.' };
      const detected = ctx.detectedRepo();
      const repo = req.repo?.trim() || cfg.github?.repo || (await detected);
      if (!repo) return { ok: false, code: 'invalid', error: 'Enter the repository as owner/name' };
      return testGitHub({ repo, token, apiUrl: apiUrl.github, fetch: o.fetch });
    }
    const apiKey = req.apiKey?.trim() || resolveLinearKey(creds.read(), env)?.token;
    if (!apiKey) return { ok: false, code: 'auth', error: 'Paste a Linear personal API key.' };
    const teamId = req.teamId ?? cfg.linear?.teamId;
    return testLinear({ apiKey, teamId, projectId: req.projectId, apiUrl: apiUrl.linear, fetch: o.fetch });
  }

  /** Linear: the team (and project) the key can read, checked first; the names saved are Linear's, not the page's. */
  async function connectLinear(l: TrackerConnectRequest['linear']): Promise<{ status: number; body: unknown }> {
    if (!l?.teamId) throw new BadRequest('"linear.teamId" is required');
    const projectId = l.projectId || undefined;
    const result = await test({ kind: 'linear', apiKey: l.apiKey, teamId: l.teamId, projectId });
    if (!result.ok) return { status: 400, body: result };
    if (l.apiKey?.trim()) creds.update((c) => ({ ...c, linear: { apiKey: l.apiKey!.trim() } }));
    linear.reset();
    const team = result.teams?.find((t) => t.id === l.teamId);
    const projectName = result.projects?.find((p) => p.id === projectId)?.name;
    choose({
      ...project.read(),
      active: 'linear',
      linear: {
        teamId: l.teamId,
        teamKey: team?.key ?? l.teamKey,
        teamName: team?.name ?? l.teamName,
        projectId,
        projectName: projectId ? (projectName ?? l.projectName) : undefined,
        orgName: result.organization,
      },
    });
    remotes.reset('linear');
    return { status: 200, body: await settings() };
  }

  async function connect(req: TrackerConnectRequest): Promise<{ status: number; body: unknown }> {
    const cfg = project.read();
    if (req.active === 'markdown') {
      choose({ ...cfg, active: 'markdown' });
      return { status: 200, body: await settings() };
    }
    if (req.active === 'github') {
      const repo = req.github?.repo?.trim();
      if (!repo) throw new BadRequest('"github.repo" is required');
      const result = await test({ kind: 'github', repo, token: req.github?.token });
      if (!result.ok) return { status: 400, body: result };
      if (req.github?.token?.trim()) creds.update((c) => ({ ...c, github: { token: req.github!.token!.trim() } }));
      lookups.reset();
      choose({ ...cfg, active: 'github', github: { repo: result.target ?? repo } });
      remotes.reset('github');
      return { status: 200, body: await settings() };
    }
    if (req.active === 'linear') return connectLinear(req.linear);
    throw new BadRequest('"active" must be markdown, github or linear');
  }

  /**
   * The human's answer to a `trackers.json` that names another tracker: use it (it becomes this machine's pin) or
   * keep the approved one (the file is written back). `target` is the key the page showed, so a file that changed
   * again since is refused rather than approved unseen.
   */
  function decide(b: { use?: unknown; target?: unknown }): { status: number; body?: unknown } {
    const { config, pending } = pin.read();
    if (!pending) return { status: 200 };
    if (b.target !== trackerTargetKey(pending))
      return { status: 409, body: { error: 'trackers.json changed again. Look at what it asks for now.' } };
    const next = b.use === true ? pending : config;
    choose(next);
    remotes.reset('github');
    remotes.reset('linear');
    lookups.reset();
    linear.reset();
    journalFile(o.root).append({
      v: 1,
      kind: 'trust',
      at: Date.now(),
      mapId: TRUST_JOURNAL,
      action: b.use === true ? 'tracker-approved' : 'tracker-kept',
      subject: trackerTargetLabel(pending),
      detail: `approved here: ${trackerTargetLabel(config)}`,
      actor: 'trail lead',
      actorKind: 'trail lead',
    });
    return { status: 200 };
  }

  return { settings, test, connect, decide };
}
