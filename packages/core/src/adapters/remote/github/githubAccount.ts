import { describeError } from '../describeError';
import { HttpClient, github, type HttpOptions } from '../http';
import type { GitHubAccount } from '../types';
import { apiBase, restHeaders } from './schema';

/** Who a token signs in as: `GET /user`. Never throws; a failure says why in plain words. */
export async function githubAccount(o: { token: string; apiUrl?: string } & HttpOptions): Promise<GitHubAccount> {
  const http = new HttpClient(github, { retries: 0, ...o });
  try {
    const { body } = await http.send<{ login: string }>(`${apiBase(o.apiUrl)}/user`, { headers: restHeaders(o.token) });
    return { kind: 'user', login: body.login };
  } catch (err) {
    const { error, code } = describeError(err, 'GitHub');
    return { kind: 'unknown', error: error ?? 'GitHub did not say who this token belongs to', code };
  }
}
