import path from 'node:path';
import type { RepoFiles } from '../model/checkScreening';
import type { RepoReadiness } from '../model/readiness';
import { detectRepoProfile } from '../repoProfile/detectRepoProfile';
import { suggestChecks } from '../repoProfile/suggestChecks';
import { trustedChecks } from '../verification/checksApproval';
import { screenConfig } from '../verification/screenConfig';
import { probeLocal } from './probeLocal';
import { repoReadiness } from './repoReadiness';

/** How long a reading stands while the checks approval is unchanged: installs and services change outside any file. */
const FRESH_MS = 10_000;

interface Cached {
  key: string;
  at: number;
  value: Promise<RepoReadiness>;
}
const cache = new Map<string, Cached>();

/** Nothing to read here (no checkout): nothing is said, nothing is held. */
function notRead(base: string, now: number): RepoReadiness {
  const empty = { units: [], findings: [], blocking: 0, tools: [], ci: [] };
  return { v: 1, basis: '', base, probed: 'skipped', checkedAt: now, layout: 'none', ...empty, read: false };
}

async function compute(o: { root: string; files: RepoFiles; probe: boolean; now: number }): Promise<RepoReadiness> {
  const { config: read, approval } = trustedChecks(o.root);
  const config = read.config;
  const profile = await detectRepoProfile(o.files);
  const screening = await screenConfig({ config, files: o.files, names: config?.run });
  const repoRoot = path.dirname(o.root);
  const probes = o.probe ? await probeLocal({ repoRoot, files: o.files, profile, config }) : undefined;
  return repoReadiness({
    profile,
    approval: { state: approval.state, waiting: approval.waiting, hash: approval.hash },
    config,
    screening,
    suggestions: suggestChecks(profile),
    probes,
    now: o.now,
  });
}

/**
 * Repo readiness for the tracker folder `root` (repoReadiness.ts), read from `files` (the checkout; undefined when
 * there's none: nothing is said) and, with `probe`, this machine (where the checks run). A reading is kept for ten
 * seconds while the checks approval stays the same, so every claim doesn't walk the repo; `fresh` reads again (Check
 * again). Readings at the same moment share one walk.
 */
export function readReadiness(o: {
  root: string;
  files?: RepoFiles;
  probe: boolean;
  fresh?: boolean;
  now?: number;
}): Promise<RepoReadiness> {
  const now = o.now ?? Date.now();
  const { approval } = trustedChecks(o.root);
  if (!o.files) return Promise.resolve(notRead(approval.hash, now));
  const key = `${approval.hash}\0${approval.approved?.hash ?? ''}\0${o.probe}`;
  const id = path.resolve(o.root);
  const hit = cache.get(id);
  if (!o.fresh && hit && hit.key === key && now - hit.at < FRESH_MS) return hit.value;
  const value = compute({ root: o.root, files: o.files, probe: o.probe, now });
  cache.set(id, { key, at: now, value });
  value.catch(() => {
    if (cache.get(id)?.value === value) cache.delete(id);
  });
  return value;
}
