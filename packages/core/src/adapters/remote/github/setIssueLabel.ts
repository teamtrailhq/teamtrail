import { TrackerError } from '../http';
import type { GitHubClient } from './githubClient';

/** Adds or removes one label on an issue; removing a label it doesn't have is not an error. */
export async function setIssueLabel(gh: GitHubClient, issue: string, name: string, on: boolean) {
  if (on) await gh.repo('POST', `/issues/${issue}/labels`, { labels: [name] });
  else
    await gh.repo('DELETE', `/issues/${issue}/labels/${encodeURIComponent(name)}`).catch((e) => {
      if (!(e instanceof TrackerError && e.code === 'not_found')) throw e;
    });
}
