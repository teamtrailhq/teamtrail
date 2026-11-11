import { RISK_CATEGORIES, RISK_LEVELS, type RiskLevel, type RiskPathRule, type RiskPolicy } from '../model/risk';

const rank = (l: RiskLevel) => RISK_LEVELS.indexOf(l);

/** A path rule the file dropped or weakened, as the approved policy has it, with the line that says so. */
function keptRule(approved: RiskPathRule, file: RiskPathRule[]): { rule: RiskPathRule; line: string } | undefined {
  const now = file.filter((r) => r.glob === approved.glob);
  if (!now.length) return { rule: approved, line: `path rule ${approved.glob} (${approved.level}) was removed` };
  const highest = now.reduce((a, b) => (rank(b.level) > rank(a.level) ? b : a));
  if (rank(highest.level) >= rank(approved.level)) return undefined;
  return { rule: approved, line: `path rule ${approved.glob}: ${approved.level} → ${highest.level}` };
}

/**
 * The policy in force while `file` waits for approval: never weaker than `approved`. A category the file lowers
 * keeps its approved level, and a path rule it removes or lowers still applies. Whatever the file raises or adds
 * applies at once. `lowered` lists what waits, in words; empty when the file lowers nothing.
 */
export function stricterPolicy(file: RiskPolicy, approved: RiskPolicy): { policy: RiskPolicy; lowered: string[] } {
  const lowered: string[] = [];
  const categories = { ...file.categories };
  for (const c of RISK_CATEGORIES) {
    if (rank(file.categories[c]) >= rank(approved.categories[c])) continue;
    lowered.push(`${c}: ${approved.categories[c]} → ${file.categories[c]}`);
    categories[c] = approved.categories[c];
  }
  const kept = approved.paths.map((r) => keptRule(r, file.paths)).filter((k) => k !== undefined);
  lowered.push(...kept.map((k) => k.line));
  return { policy: { v: 1, categories, paths: [...file.paths, ...kept.map((k) => k.rule)] }, lowered };
}
