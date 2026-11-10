import type { SlackStatus } from '@teamtrail/connector-slack';

export const STEPS: { n: 1 | 2 | 3 | 4 | 5; title: string }[] = [
  { n: 1, title: 'Create your app' },
  { n: 2, title: 'Workspace' },
  { n: 3, title: 'App token' },
  { n: 4, title: 'Install' },
  { n: 5, title: 'Owner' },
];

/** Steps 2 and 3 are one stretch in Slack: nothing is verifiable until the app-level token is pasted. */
export const isCurrent = (step: SlackStatus['step'], n: number) => step === n || (step === 2 && n === 3);

export const isDone = (step: SlackStatus['step'], n: number) =>
  step === 'done' || (typeof step === 'number' && n < step && !isCurrent(step, n));

export function stepClass(step: SlackStatus['step'], n: number) {
  if (isDone(step, n)) return 'done';
  if (isCurrent(step, n)) return 'cur';
  return '';
}
