import { describeError } from '../describeError';
import { HttpClient, linear, type HttpOptions } from '../http';
import type { LinearViewer } from '../types';
import { linearGql } from './linearGql';

/** Who a Linear key belongs to and their organization. Never throws; a failure says why in plain words. */
export async function linearViewer(o: { apiKey: string; apiUrl?: string } & HttpOptions): Promise<LinearViewer> {
  const http = new HttpClient(linear, { retries: 0, ...o });
  try {
    const gql = linearGql(http, o.apiKey.trim(), o.apiUrl);
    const d = await gql<{ viewer: { name: string; email?: string | null }; organization: { name: string } }>(
      `query Viewer { viewer { name email } organization { name } }`,
    );
    return { kind: 'user', name: d.viewer.name, email: d.viewer.email ?? undefined, orgName: d.organization.name };
  } catch (err) {
    const { error, code } = describeError(err, 'Linear');
    return { kind: 'unknown', error: error ?? 'Linear did not say who this key belongs to', code };
  }
}
