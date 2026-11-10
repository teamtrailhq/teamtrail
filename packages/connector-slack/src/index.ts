import type { SlackOwnerCode, SlackSettingsPatch, SlackStatus, SlackTokenResult, SlackUser } from './types';

export * from './types';
export {
  BOT_SCOPES,
  OPTIONAL_SCOPES,
  DEFAULT_COMMAND,
  SAVE_DECISION_CALLBACK,
  appIdFromToken,
  slackLinks,
  slackManifest,
  tokenKind,
} from './manifest';

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
    created: () => req<SlackStatus>(`${base}/created`, 'POST', {}),
    token: (token: string) => req<SlackTokenResult>(`${base}/token`, 'POST', { token }),
    update: (patch: SlackSettingsPatch) => req<SlackStatus>(`${base}/settings`, 'PUT', patch),
    ownerCode: () => req<SlackOwnerCode>(`${base}/owner/code`, 'POST', {}),
    confirmOwner: (id: string) => req<SlackStatus>(`${base}/owner/confirm`, 'POST', { id }),
    resetOwner: () => req<SlackStatus>(`${base}/owner/reset`, 'POST', {}),
    members: () => req<{ members: SlackUser[] }>(`${base}/members`).then((r) => r.members),
    remove: () => req<SlackStatus>(base, 'DELETE'),
  };
}
