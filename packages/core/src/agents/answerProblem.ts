import type { ActivityStream } from '../activity/activityStream';

/** A problem with a question's answers, said in the asking session's feed (agentDocWriter.ts). */
export function sayAnswerProblem(activity: ActivityStream, sessionId: string, text: string) {
  activity.push({ source: 'system', level: 'alert', kind: 'problem', sessionId, text });
}
