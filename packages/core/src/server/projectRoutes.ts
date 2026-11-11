import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TrackerAdapter } from '../adapters/adapter';
import { AnswerError, readAgentDocs, writeAgentAnswer } from '../agents/agentDocs';
import type { AgentAnswer } from '../agents/agentLink';
import type { ProjectEntry, ProjectsBriefing, ProjectState, ProjectsView } from '../model/project';
import { projectBriefing } from '../projects/projectBriefing';
import { updateProjects } from '../projects/projectsFile';
import { ProjectPathError, registerProject, trackerRootFor, unregisterProject } from '../projects/registerProject';
import { TRAIL_LEAD } from './guideJournal';
import { BadRequest, readJson, sendJson } from './http';
import { crossSite } from './trackerErrors';

/** What the `/projects` routes need from the hub. */
export interface ProjectRoutesContext {
  configDir: string;
  entries: () => ProjectEntry[];
  stateOf: (entry: ProjectEntry) => ProjectState;
  adapterOf: (entry: ProjectEntry, state: ProjectState) => Promise<TrackerAdapter | undefined>;
  view: () => Promise<ProjectsView>;
  /** The registry changed: close a removed project's bridge and tell the open Lookouts. */
  changed: (removed?: string) => void;
}

function required(body: Record<string, unknown>, keys: string[]) {
  for (const k of keys)
    if (typeof body[k] !== 'string' || !(body[k] as string).trim()) throw new BadRequest(`"${k}" is required`);
}

async function addProject(ctx: ProjectRoutesContext, req: IncomingMessage, res: ServerResponse) {
  const body = await readJson<{ path?: unknown }>(req);
  required(body, ['path']);
  try {
    const root = trackerRootFor(body.path as string, { create: true });
    const added = registerProject({ configDir: ctx.configDir, root });
    ctx.changed();
    sendJson(res, added.added ? 201 : 200, added);
  } catch (e) {
    if (e instanceof ProjectPathError) throw new BadRequest(e.message);
    throw e;
  }
}

/** The session waiting on a question: the overview's queue knows the question id, not always the session. */
async function sessionOf(root: string, questionId: string): Promise<string> {
  const docs = await readAgentDocs(root);
  const doc = docs.find((d) => d.pending.some((q) => q.id === questionId));
  if (!doc) throw new AnswerError(`question "${questionId}" is not waiting for an answer`);
  return doc.session.id;
}

async function answer(ctx: ProjectRoutesContext, entry: ProjectEntry, req: IncomingMessage, res: ServerResponse) {
  const b = await readJson<Partial<AgentAnswer>>(req);
  required(b, ['questionId', 'text']);
  // Both ids become file names under .agents/: only what Teamtrail itself hands out (as /agents/answer).
  for (const k of ['sessionId', 'questionId'] as const)
    if (b[k] !== undefined && (typeof b[k] !== 'string' || !/^[\w.-]{1,120}$/.test(b[k]) || b[k].includes('..')))
      throw new BadRequest(`"${k}" is not an id`);
  const sessionId =
    typeof b.sessionId === 'string' && b.sessionId ? b.sessionId : await sessionOf(entry.root, b.questionId!);
  // Given in the Lookout (All projects), by its trail lead: this route says so, whatever the body says.
  const author = TRAIL_LEAD;
  sendJson(
    res,
    201,
    writeAgentAnswer(entry.root, { sessionId, questionId: b.questionId!, text: b.text!, author, via: 'lookout' }),
  );
  ctx.changed();
}

async function briefing(ctx: ProjectRoutesContext, url: URL, res: ServerResponse) {
  const since = Number(url.searchParams.get('since'));
  if (!Number.isFinite(since) || since <= 0) throw new BadRequest('"since" (epoch ms) is required');
  const view = await ctx.view();
  const out: ProjectsBriefing = { since, projects: [] };
  for (const entry of ctx.entries()) {
    const state = ctx.stateOf(entry);
    const adapter = state.kind === 'missing' ? undefined : await ctx.adapterOf(entry, state);
    if (!adapter) continue;
    const attention = view.attention.filter((i) => i.projectId === entry.id);
    const b = await projectBriefing({ root: entry.root, adapter, since, attention });
    if (b.changed) out.projects.push({ projectId: entry.id, project: entry.name, briefing: b });
  }
  sendJson(res, 200, out);
}

async function setAutoRegister(ctx: ProjectRoutesContext, req: IncomingMessage, res: ServerResponse) {
  const b = await readJson<{ autoRegister?: unknown }>(req);
  if (typeof b.autoRegister !== 'boolean') throw new BadRequest('"autoRegister" (true or false) is required');
  const next = updateProjects(ctx.configDir, (f) => ({ ...f, autoRegister: b.autoRegister as boolean }));
  ctx.changed();
  sendJson(res, 200, { autoRegister: next.autoRegister });
}

/** `/projects/<id>` (DELETE: forget it) and `/projects/<id>/answer` (POST). */
async function oneProject(ctx: ProjectRoutesContext, req: IncomingMessage, res: ServerResponse, p: string) {
  const m = /^\/projects\/([^/]+)(\/answer)?$/.exec(p);
  if (!m) return false;
  const entry = ctx.entries().find((e) => e.id === m[1]);
  if (!entry) return (sendJson(res, 404, { error: `unknown project "${m[1]}"` }), true);
  if (m[2] && req.method === 'POST') {
    if (ctx.stateOf(entry).kind === 'missing') return (sendJson(res, 404, { error: 'project folder not found' }), true);
    return (await answer(ctx, entry, req, res), true);
  }
  if (m[2] || req.method !== 'DELETE') return false;
  const gone = unregisterProject({ configDir: ctx.configDir, idOrPath: entry.id });
  ctx.changed(entry.id);
  return (sendJson(res, gone ? 200 : 404, { removed: gone?.id ?? null }), true);
}

/**
 * `/projects` routes, outside any one project: the overview (GET), adding and removing projects, the
 * auto-register setting, the cross-project briefing, and answering an agent's question in any project
 * through that project's answer files. False when none matches.
 */
export async function handleProjects(
  ctx: ProjectRoutesContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const p = url.pathname;
  if (p !== '/projects' && !p.startsWith('/projects/')) return false;
  if (req.method !== 'GET' && crossSite(req))
    return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  const route = `${req.method} ${p}`;
  if (route === 'GET /projects') return (sendJson(res, 200, await ctx.view()), true);
  if (route === 'GET /projects/briefing') return (await briefing(ctx, url, res), true);
  if (route === 'POST /projects') return (await addProject(ctx, req, res), true);
  if (route === 'PUT /projects/settings') return (await setAutoRegister(ctx, req, res), true);
  return oneProject(ctx, req, res, p);
}
