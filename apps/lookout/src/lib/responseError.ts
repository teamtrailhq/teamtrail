/** Why a request to the bridge didn't go through (its `error`, else the status); undefined when it did. */
export async function responseError(r: Response | undefined): Promise<string | undefined> {
  if (!r) return 'Could not reach the Lookout';
  if (r.ok) return undefined;
  const b = (await r.json().catch(() => ({}))) as { error?: string };
  return b.error ?? `HTTP ${r.status}`;
}
