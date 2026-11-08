import { BRAND } from '@teamtrail/core';

const base = `${BRAND.apiPrefix}`;

async function answer<T>(r: Response): Promise<T> {
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status})`);
  return body;
}

/** GET a roles route (`/roles…`) as JSON; a refusal throws its message. */
export const getRoles = async <T>(path: string): Promise<T> => answer<T>(await fetch(`${base}${path}`));

/** POST to a roles route; a refusal (400, 409, 502) throws its message. */
export const postRoles = async <T>(path: string, body: unknown): Promise<T> =>
  answer<T>(
    await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
