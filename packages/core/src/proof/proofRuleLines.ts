import type { Proof, ProofRule } from '../model/proof';

type Escape = (text: string, max?: number) => string;

function checkLine(r: ProofRule, md: Escape): string[] {
  if (!r.check) return [];
  const name = `\`${md(r.check.name, 60)}\``;
  if (r.check.passed === null) return [`  - ⏭️ ${name} didn't run`];
  return [`  - ${r.check.passed ? '✅' : '❌'} ${name} ran here (verified)`];
}

function askLine(r: ProofRule, md: Escape): string[] {
  if (!r.ask) return [];
  const asked = `asked: ${md(r.ask, 300)}`;
  if (r.answer) return [`  - ${asked}`, `  - answered by the agent (claimed, not verified): ${md(r.answer, 600)}`];
  if (r.waived) return [`  - ${asked}`, `  - not answered: ${md(r.waived.by, 60)} waived it: ${md(r.waived.reason)}`];
  return [`  - ${asked}`, '  - not answered'];
}

/**
 * The diff rules the changes matched, for the proof as a pull request shows it: why each exists, the files that
 * triggered it, its check (verified) and its question with the agent's answer (claimed). Everything escaped by `md`.
 */
export function proofRuleLines(p: Proof, md: Escape): string[] {
  if (!p.rules?.length) return [];
  const rule = (r: ProofRule) => [
    `- ${md(r.id, 20)} (${md(r.why)}), for ${r.files.map((f) => `\`${md(f, 120)}\``).join(', ')}`,
    ...checkLine(r, md),
    ...askLine(r, md),
  ];
  return ['', '**Diff rules:**', ...p.rules.flatMap(rule)];
}
