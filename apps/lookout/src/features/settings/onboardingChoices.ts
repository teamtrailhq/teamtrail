import type { TrackerSettings } from '@teamtrail/core';
import type { TrackerChoice } from '../../lib';
import { willUse, willUseLinear } from '../trackers';

export interface OnboardingChoice {
  id: TrackerChoice;
  title: string;
  sub?: string;
}

/**
 * The three tracker choices. GitHub and Linear say who and where they would use before anything connects; once one
 * is chosen, its setup below says it instead.
 */
export function onboardingChoices(s: TrackerSettings | undefined, chosen: TrackerChoice): OnboardingChoice[] {
  const gh = s?.github;
  const ln = s?.linear;
  const ghSub = gh && chosen !== 'github' ? willUse(gh, gh.repo ?? gh.detectedRepo) : undefined;
  const lnSub =
    ln && chosen !== 'linear'
      ? willUseLinear({ viewer: ln.viewer, team: ln.teamName, project: ln.projectName, source: ln.auth })
      : undefined;
  return [
    { id: 'markdown', title: 'Local markdown', sub: 'Files in .teamtrail/ in this repo' },
    { id: 'github', title: 'GitHub Issues', sub: ghSub ?? 'Trails as labelled issues in your repo' },
    { id: 'linear', title: 'Linear', sub: lnSub ?? 'Trails and tickets in your Linear team' },
  ];
}
