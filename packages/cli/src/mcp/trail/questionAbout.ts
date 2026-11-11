import { oneLine, type MapMode } from '@teamtrail/core';

/**
 * A trail lead's setting a question asks the human to change: what their answer, given in the Lookout or Slack,
 * then lets the agent do (humanCall.ts). The Lookout and Slack show it with the question, so the human knows.
 */
export type QuestionAbout =
  { kind: 'skip-discovery' } | { kind: 'mode'; mode: MapMode } | { kind: 'destination'; destination: string };

/** The same setting, to the letter: a destination counts only as the exact text asked about. */
export function sameAbout(a: QuestionAbout | undefined, b: QuestionAbout): boolean {
  if (!a || a.kind !== b.kind) return false;
  switch (b.kind) {
    case 'skip-discovery':
      return true;
    case 'mode':
      return a.kind === 'mode' && a.mode === b.mode;
    case 'destination':
      return a.kind === 'destination' && a.destination.trim() === b.destination.trim();
    default: {
      const never: never = b;
      return never;
    }
  }
}

/** "skip discovery", "switch the trail to plan+execute", "set the destination to “…”". */
export function aboutText(a: QuestionAbout): string {
  switch (a.kind) {
    case 'skip-discovery':
      return 'skip discovery';
    case 'mode':
      return `switch the trail to ${a.mode}`;
    case 'destination':
      return `set the destination to “${oneLine(a.destination).slice(0, 200)}”`;
    default: {
      const never: never = a;
      return never;
    }
  }
}

/** The `about` argument an agent passes to ask_human for it, as JSON. */
export const aboutArg = (a: QuestionAbout) => JSON.stringify(a);
