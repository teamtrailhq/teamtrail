import type { GitHubClient } from './githubClient';

/** The login the token belongs to (`viewer`), for settings written before any trail was read. */
export async function githubViewer(gh: GitHubClient): Promise<string | undefined> {
  const d = await gh.gql<{ viewer?: { login: string } | null }>('query Me { viewer { login } }', {});
  return d.viewer?.login;
}
