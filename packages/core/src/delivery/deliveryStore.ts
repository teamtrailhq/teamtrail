import { readFileSync } from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from '../lib/jsonFile';
import type { DeliveryProblem } from '../model/delivery';

/*
 * Messages a connector could not deliver, so the Lookout can say so:
 *   <tracker dir>/.agents/delivery.json   `{ v: 1, problems: { <channel>: DeliveryProblem } }`. Local only.
 * A connector writes its channel's problem when Slack (or another service) refuses a message for good, and clears
 * it when a message gets through.
 */
const FILE = path.join('.agents', 'delivery.json');

export function readDeliveryProblems(root: string): DeliveryProblem[] {
  try {
    const raw = JSON.parse(readFileSync(path.join(root, FILE), 'utf8')) as {
      problems?: Record<string, DeliveryProblem>;
    };
    return Object.values(raw.problems ?? {}).filter((p) => p && typeof p.channel === 'string');
  } catch {
    return [];
  }
}

/** Sets or (with `undefined`) clears one channel's problem. */
export function writeDeliveryProblem(root: string, channel: string, problem: DeliveryProblem | undefined) {
  const problems = Object.fromEntries(readDeliveryProblems(root).map((p) => [p.channel, p]));
  if (problem) problems[channel] = problem;
  else delete problems[channel];
  writeJsonAtomic(path.join(root, FILE), { v: 1, problems });
}
