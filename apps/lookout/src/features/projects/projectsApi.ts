import { BRAND, type AgentAnswer, type ProjectEntry, type ProjectsBriefing } from '@teamtrail/core';

/** The `/projects` routes live outside any one project, so they never take the `/p/<id>` prefix. */
const base = `${BRAND.apiPrefix}/projects`;

async function send<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const b = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
  return b;
}

export const projectsApi = {
  url: base,
  add: (path: string) => send<{ entry: ProjectEntry; added: boolean }>('', 'POST', { path }),
  remove: (id: string) => send<{ removed: string | null }>(`/${id}`, 'DELETE'),
  setAutoRegister: (autoRegister: boolean) => send<{ autoRegister: boolean }>('/settings', 'PUT', { autoRegister }),
  answer: (id: string, a: { sessionId?: string; questionId: string; text: string }) =>
    send<AgentAnswer>(`/${id}/answer`, 'POST', a),
  async briefing(since: number): Promise<ProjectsBriefing | undefined> {
    const r = await fetch(`${base}/briefing?since=${since}`);
    return r.ok ? ((await r.json()) as ProjectsBriefing) : undefined;
  },
};
