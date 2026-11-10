import { testGitHub } from '../adapters/remote/github';
import { testLinear } from '../adapters/remote/linear';
import type {
  TrackerConnectRequest,
  TrackerSettings,
  TrackerTestRequest,
  TrackerTestResult,
} from '../adapters/remote/types';
import type { GitHubLookups } from './githubLookups';
import type { GitHubSignIn } from './githubSignIn';
import { BadRequest } from './http';
import type { LinearLookups } from './linearLookups';
import type { RemoteAdapters } from './remoteAdapters';
import { resolveLinearKey } from './trackerConfig';
import type { TrackerContext } from './trackerContext';

/** Reading, testing and switching the project's tracker connection. */
export function trackerSettings(deps: {
  ctx: TrackerContext;
  remotes: RemoteAdapters;
  lookups: GitHubLookups;
  linear: LinearLookups;
  signIn: GitHubSignIn;
}) {
  const { ctx, remotes, lookups, linear, signIn } = deps;
  const { o, env, creds, project, apiUrl } = ctx;

  async function settings(): Promise<TrackerSettings> {
    const cfg = project.read();
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
    };
  }

  async function test(req: TrackerTestRequest): Promise<TrackerTestResult> {
    const cfg = project.read();
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
    project.write({
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
      project.write({ ...cfg, active: 'markdown' });
      return { status: 200, body: await settings() };
    }
    if (req.active === 'github') {
      const repo = req.github?.repo?.trim();
      if (!repo) throw new BadRequest('"github.repo" is required');
      const result = await test({ kind: 'github', repo, token: req.github?.token });
      if (!result.ok) return { status: 400, body: result };
      if (req.github?.token?.trim()) creds.update((c) => ({ ...c, github: { token: req.github!.token!.trim() } }));
      lookups.reset();
      project.write({ ...cfg, active: 'github', github: { repo: result.target ?? repo } });
      remotes.reset('github');
      return { status: 200, body: await settings() };
    }
    if (req.active === 'linear') return connectLinear(req.linear);
    throw new BadRequest('"active" must be markdown, github or linear');
  }

  return { settings, test, connect };
}
