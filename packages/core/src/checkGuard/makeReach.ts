interface Rule {
  targets: string[];
  prereqs: string[];
  /** Line numbers of the rule line and its recipe. */
  lines: number[];
  recipe: string[];
}

const RULE = /^([^\s#:=][^:=]*?)\s*::?(?!=)(.*)$/;

/** The makefile's rules: a rule line and the tab-indented recipe after it. */
function rules(lines: string[]): Rule[] {
  const out: Rule[] = [];
  let cur: Rule | undefined;
  lines.forEach((line, n) => {
    if (cur && line.startsWith('\t')) {
      cur.lines.push(n);
      cur.recipe.push(line.slice(1));
      return;
    }
    if (cur && !line.trim()) return;
    const m = line.match(RULE);
    cur = m
      ? {
          targets: m[1].split(/\s+/),
          prereqs: m[2].split(';')[0].split(/\s+/).filter(Boolean),
          lines: [n],
          recipe: [],
        }
      : undefined;
    if (cur) out.push(cur);
  });
  return out;
}

/** A recipe line as a command: without `@`, `-` and `+`, `$(MAKE)` read as `make`. */
const recipeCommand = (line: string) =>
  line
    .replace(/^[@+-]+/, '')
    .replace(/\$[({]MAKE[)}]/g, 'make')
    .trim();

/**
 * What `make <target>` runs in a makefile's text: the recipe lines of the target and of every target it depends on,
 * and the text that matters to it: the whole file without the rules of targets it never reaches (a new `docs` target
 * changes nothing for `make test`; a variable or an include does). No target: the first rule's.
 */
export function makeReach(text: string, target?: string): { recipes: string[]; relevant: string } {
  const lines = text.split('\n');
  const all = rules(lines).filter((r) => !r.targets.every((t) => t.startsWith('.')));
  const goal = target ?? all[0]?.targets[0];
  const reached = new Set<Rule>();
  const queue = goal ? [goal] : [];
  const seen = new Set<string>();
  while (queue.length) {
    const t = queue.shift()!;
    if (seen.has(t)) continue;
    seen.add(t);
    for (const r of all.filter((x) => x.targets.includes(t))) {
      reached.add(r);
      queue.push(...r.prereqs);
    }
  }
  const dropped = new Set(all.filter((r) => !reached.has(r)).flatMap((r) => r.lines));
  return {
    recipes: [...reached].flatMap((r) => r.recipe.map(recipeCommand)).filter(Boolean),
    relevant: lines.filter((_, n) => !dropped.has(n)).join('\n'),
  };
}
