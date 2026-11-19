import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readJsonFile } from '../lib/jsonFile';
import { agentPaths, type AgentAnswer } from './agentLink';

/** One answer file given to a question, as read: its content is not checked here. */
export interface AnswerFile {
  file: string;
  /** Its place in line: 0 for the single file older versions write, else the number it was created under. */
  seq: number;
  ans?: AgentAnswer;
}

/** `<n>.json`, n from 1, at most 15 digits (a safe integer); any other name in the folder is not an answer. */
const NUMBERED = /^([1-9]\d{0,14})\.json$/;

/** The numbers taken in an answer folder, whatever the files hold, lowest first. */
export function answerNumbers(dir: string): number[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .map((n) => NUMBERED.exec(n)?.[1])
    .filter((n): n is string => !!n)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * Every answer file given to a question, in the order answers count: the single file older versions write first,
 * then the numbered ones (addAnswerFile.ts) by number. The first that verifies is the answer
 * (agentDocWriter.ts); a file that doesn't verify takes no place in line and blocks nothing.
 */
export function answerFiles(root: string, sessionId: string, questionId: string): AnswerFile[] {
  const legacy = path.join(root, agentPaths.answer(sessionId, questionId));
  const dir = path.join(root, agentPaths.answerDir(sessionId, questionId));
  const old = readJsonFile<AgentAnswer>(legacy);
  const numbered = answerNumbers(dir).map((seq) => {
    const file = path.join(dir, `${seq}.json`);
    return { file, seq, ans: readJsonFile<AgentAnswer>(file) };
  });
  return [...(old ? [{ file: legacy, seq: 0, ans: old }] : []), ...numbered];
}
