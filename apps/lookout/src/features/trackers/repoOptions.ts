import type { GitHubRepoOption } from '@teamtrail/core';

const OWNER_NAME = /^[\w.-]+\/[\w.-]+$/;

/**
 * What the repo picker shows for a search: this project's repo first, then the rest by last push, at most
 * `limit`. A typed `owner/name` that isn't listed comes back as `typed`, so it can still be chosen.
 */
export function repoOptions(o: { repos: GitHubRepoOption[]; detected?: string; query: string; limit: number }) {
  const q = o.query.trim().toLowerCase();
  const unlisted = !!o.detected && o.repos.every((r) => r.fullName !== o.detected);
  // This project's origin is offered even when the list doesn't have it (cut at the cap, or no push rights yet).
  const withDetected = unlisted ? [{ fullName: o.detected!, private: false }, ...o.repos] : o.repos;
  const ordered = [
    ...withDetected.filter((r) => r.fullName === o.detected),
    ...withDetected.filter((r) => r.fullName !== o.detected),
  ];
  const matches = q ? ordered.filter((r) => r.fullName.toLowerCase().includes(q)) : ordered;
  const isNew = OWNER_NAME.test(o.query.trim()) && matches.every((r) => r.fullName.toLowerCase() !== q);
  const typed = isNew ? o.query.trim() : undefined;
  return { shown: matches.slice(0, o.limit), matches: matches.length, typed };
}
