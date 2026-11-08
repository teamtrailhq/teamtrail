import type { ProposedCheck, GuideDoc, GuideFinding } from '../model/guide';
import { parseGuide } from './guideFile';
import { INLINE_CODE, NETWORK_TOOLS, SHELLS, TEXT_RULES } from './injectionRules';

export interface GuideLint {
  guide?: GuideDoc;
  /** Errors and warnings, by line. A guide with any error can't be installed or used. */
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

function lintText(text: string): GuideFinding[] {
  const out: GuideFinding[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const r of TEXT_RULES) {
      if (r.rule === 'link' && /^homepage\s*:/.test(line)) continue;
      if (r.re.test(line)) out.push({ line: i + 1, rule: r.rule, level: r.level, message: r.message });
    }
  });
  return out;
}

/** A proposed check runs only after approval, and even then must be a plain program with arguments. */
function lintChecks(text: string, guide: GuideDoc): GuideFinding[] {
  return Object.entries(guide.proposedChecks).flatMap(([name, spec]) => {
    const line = checkLine(text, name);
    return argvProblems(spec).map((message) => ({ line, rule: 'check-command', level: 'error' as const, message }));
  });
}

/** Why an argv is unsafe to propose, if it is. */
export function argvProblems(spec: ProposedCheck): string[] {
  const program = (spec.run[0] ?? '').split(/[\\/]/).pop()!.toLowerCase();
  const problems: string[] = [];
  if (SHELLS.has(program)) problems.push(`runs a shell (${program}); name the program and its arguments instead`);
  if (NETWORK_TOOLS.has(program)) problems.push(`runs ${program}, which reaches the network`);
  if (spec.run.slice(1).some((a) => INLINE_CODE.test(a)))
    problems.push('runs code given inline; point at a script in the repo instead');
  if (spec.cwd && (spec.cwd.startsWith('/') || spec.cwd.split(/[\\/]/).includes('..')))
    problems.push('cwd must stay inside the repo');
  return problems;
}

function checkLine(text: string, name: string) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^proposedChecks\s*:/.test(l));
  const at = lines.findIndex((l, i) => i > start && new RegExp(`^\\s+${name.replace(/\./g, '\\.')}\\s*:`).test(l));
  return (at >= 0 ? at : Math.max(start, 0)) + 1;
}
