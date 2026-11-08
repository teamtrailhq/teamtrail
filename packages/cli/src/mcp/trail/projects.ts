import { configDir } from '@teamtrail/core/bridge';
import { fileAdapter, projectEntries, projectState, projectSummary } from '@teamtrail/core/node';

/**
 * `projects_status`: the other registered projects at a glance, read from their files, so an agent can tell
 * the human "the other repo has 2 questions waiting". Read-only: nothing here writes to any project.
 */
export async function projectsStatus(input: { root: string; configDir?: string }) {
  const dir = input.configDir ?? configDir();
  const { entries } = projectEntries(dir, input.root);
  const [, ...others] = entries;
  const summaries = await Promise.all(
    others.map(async (entry) => {
      const state = projectState(entry.root);
      const adapter = state.kind === 'missing' ? undefined : fileAdapter(entry.root);
      const { summary } = await projectSummary({ entry, home: false, state, adapter, configDir: dir });
      return {
        project: summary.name,
        path: summary.path,
        state: summary.state.kind,
        agentsRunning: summary.agents,
        questionsWaiting: summary.questions,
        needsHuman: summary.needsYou,
        interrupting: summary.interrupting,
        top: summary.top?.title,
        working: summary.phases.working,
        blocked: summary.phases.blocked,
        prFlags: summary.flags,
        stalledClaims: summary.stalled,
        lastActivity: summary.lastActivity && new Date(summary.lastActivity).toISOString(),
        note: summary.note,
      };
    }),
  );
  return {
    projects: summaries,
    note: summaries.length
      ? 'Other projects on this machine. Tell the human what needs them there; you can only work in this repo.'
      : 'No other projects registered. The human adds them with `teamtrail projects add <path>`.',
  };
}
