import type { SlackConnectPreview, SlackConnectStart, SlackSettingsPatch, SlackStatus, SlackUser } from './types';

export * from './types';
export { DEFAULT_COMMAND, SAVE_DECISION_CALLBACK } from './service/constants';

async function req<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok && !(j as { status?: unknown }).status) throw new Error(j.error ?? `request failed (${r.status})`);
  return j;
}

/** Browser client for the local server's `/slack` routes. */
export function slackSettingsApi(prefix: string) {
  const base = `${prefix}/slack`;
  return {
    get: () => req<SlackStatus>(base),
    connectStart: (project?: string) => req<SlackConnectStart>(`${base}/connect/start`, 'POST', { project }),
    connectPreview: (code: string) => req<SlackConnectPreview>(`${base}/connect/preview`, 'POST', { code }),
    connectFinish: (code: string) => req<SlackStatus>(`${base}/connect/finish`, 'POST', { code }),
    connectCancel: () => req<SlackStatus>(`${base}/connect/cancel`, 'POST', {}),
    disconnect: () => req<SlackStatus>(`${base}/connect`, 'DELETE'),
    update: (patch: SlackSettingsPatch) => req<SlackStatus>(`${base}/settings`, 'PUT', patch),
    members: () => req<{ members: SlackUser[] }>(`${base}/members`).then((r) => r.members),
  };
}
