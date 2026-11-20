import { isLive, type KnowledgeEntry } from '../knowledge/knowledge';
import {
  blobHash,
  createKnowledge,
  listKnowledgeFiles,
  repoRootFor,
  writeKnowledge,
} from '../knowledge/knowledgeStore';
import { staleAnchors } from '../knowledge/staleness';
import { BRAND } from '../model/brand';
import type { RepoFiles } from '../model/checkScreening';
import { OperationError } from '../planning/operations/operationError';
import { detectRepoProfile } from '../repoProfile/detectRepoProfile';
import { trustedChecks } from '../verification/checksApproval';
import { commandNotes } from './commandNotes';
import { PROFILE_SOURCE, type CommandNote } from './types';

const sameAnchors = (e: KnowledgeEntry, n: CommandNote) =>
  e.anchors.map((a) => a.path).join('\n') === n.anchors.join('\n');
const same = (e: KnowledgeEntry, n: CommandNote) =>
  e.title === n.title && e.body === n.body && e.scope.join('\n') === n.scope.join('\n') && sameAnchors(e, n);

/** The entry a note writes: suggested, by Teamtrail, from the profile, anchored to its manifests (hashed on confirm). */
const draftOf = (n: CommandNote, now: number) => ({
  title: n.title,
  body: n.body,
  kind: 'convention' as const,
  status: 'suggested' as const,
  scope: n.scope,
  tags: n.tags,
  sources: [PROFILE_SOURCE, n.unit],
  anchors: n.anchors.map((path) => ({ path })),
  createdBy: BRAND.name,
  createdAt: now,
  updatedAt: now,
});

/**
 * A note left as it is: the same text, one the trail lead retired, or one they confirmed (or kept as an assumption)
 * whose manifests haven't changed since, so whatever differs is their own edit or the approved checks', not the repo.
 */
function kept(had: KnowledgeEntry, n: CommandNote, hashOf: (p: string) => string | undefined) {
  if (had.status === 'outdated' || same(had, n)) return true;
  return isLive(had) && !staleAnchors(had, hashOf).length;
}

export interface ProposedNotes {
  added: string[];
  updated: string[];
  unchanged: string[];
}

/**
 * Suggests a knowledge entry of the commands for each unit of the repo (commandNotes.ts), read from this checkout's
 * files and the approved verification.json. A unit with no note gets a new suggestion; a suggestion that no longer says
 * what the repo does is rewritten; a confirmed note whose manifests changed since is rewritten as a suggestion, so
 * agents stop getting it until the trail lead confirms the new text (one whose manifests didn't change keeps their
 * edits); one they retired (outdated) is left alone. Nothing is trusted until
 * the trail lead confirms it in the Lookout (knowledgeRoutes.ts), which records its anchors' hashes.
 */
export async function proposeCommandNotes(o: { root: string; files: RepoFiles | undefined }): Promise<ProposedNotes> {
  if (!o.files) throw new OperationError('There is no checkout here to read the commands from.');
  const profile = await detectRepoProfile(o.files);
  const config = trustedChecks(o.root).config.config;
  const notes = commandNotes({ profile, config });
  const existing = listKnowledgeFiles(o.root).filter((e) => e.sources.includes(PROFILE_SOURCE));
  const out: ProposedNotes = { added: [], updated: [], unchanged: [] };
  const now = Date.now();
  const repo = repoRootFor(o.root);
  const hashOf = (p: string) => blobHash(repo, p);
  for (const n of notes) {
    const had = existing.find((e) => e.sources.includes(n.unit));
    if (!had) {
      out.added.push(createKnowledge(o.root, draftOf(n, now)).id);
      continue;
    }
    if (kept(had, n, hashOf)) {
      out.unchanged.push(had.id);
      continue;
    }
    const { createdAt, createdBy } = had;
    writeKnowledge(o.root, { ...draftOf(n, now), id: had.id, createdAt, createdBy });
    out.updated.push(had.id);
  }
  return out;
}
