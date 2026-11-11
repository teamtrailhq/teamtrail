import type { GuideDoc, GuideFinding } from '../model/guide';
import { checkArgv, checkNotice } from './checkArgv';
import { parseGuide } from './guideFile';
import { lintText } from './textLint';

export interface GuideLint {
  guide?: GuideDoc;
  /**
   * Errors and warnings, by line. A guide with any error can't be installed or used. A clean lint is not a review:
   * it looks for common problems, and the human still reads the guide and its checks before approving them.
   */
  findings: GuideFinding[];
  ok: boolean;
}

/**
 * The full check of a guide file: the schema and size caps, then the safety lint over every line (prompt injection,
 * answering for the human, self-approval, protected files, tool permissions, hidden text, network exfiltration)
 * and over each proposed check's argv. Every finding names its line.
 */
export function lintGuide(text: string): GuideLint {
  const parsed = parseGuide(text);
  const findings = [
    ...parsed.findings,
    ...lintText(text),
    ...(parsed.guide ? lintChecks(text, parsed.guide) : []),
  ].sort((a, b) => a.line - b.line);
  return { ...(parsed.guide ? { guide: parsed.guide } : {}), findings, ok: !findings.some((f) => f.level === 'error') };
}

/** A proposed check runs only after approval, and even then must be a plain program with arguments. */
function lintChecks(text: string, guide: GuideDoc): GuideFinding[] {
  return Object.entries(guide.proposedChecks).flatMap(([name, spec]) => {
    const line = checkLine(text, name);
    const errors = checkArgv(spec).map((message) => ({
      line,
      rule: 'check-command',
      level: 'error' as const,
      message,
    }));
    const notice = checkNotice(spec);
    // not refused, but not a check Teamtrail knows: approved only with an acknowledgement
    return notice ? [...errors, { line, rule: 'check-unknown', level: 'warn' as const, message: notice }] : errors;
  });
}

function checkLine(text: string, name: string) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^proposedChecks\s*:/.test(l));
  const at = lines.findIndex((l, i) => i > start && new RegExp(`^\\s+${name.replace(/\./g, '\\.')}\\s*:`).test(l));
  return (at >= 0 ? at : Math.max(start, 0)) + 1;
}
