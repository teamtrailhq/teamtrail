import type { ClaudeProtection } from './protectClaude';

const PAD = '                  ';
const WHY =
  "Claude Code's file tools, and its sandboxed commands when the sandbox is on, can't read or change it. Teamtrail's own MCP server is not affected";

/** What `connect` prints about the config folder for Claude Code: exactly what it added, and how to take it out. */
export function claudeProtectionLines(p: ClaudeProtection, dirs: string[]): string[] {
  const folder = dirs.join(' and ');
  switch (p.kind) {
    case 'added':
      return [
        `  Config folder   protected · ${folder} · added to ${p.file}:`,
        ...p.added.map((a) => `${PAD}+ ${a}`),
        `${PAD}${WHY}.`,
        `${PAD}To remove: delete those entries from ${p.file}; connect with --no-protect-config to skip this.`,
      ];
    case 'unchanged':
      return [
        `  Config folder   already protected · ${folder} · deny rules in ${p.file}`,
        `${PAD}To remove: delete the entries naming it from ${p.file}; connect with --no-protect-config to skip this.`,
      ];
    case 'unreadable':
      return [
        `  Config folder   not protected: ${p.file} was not changed (it isn't plain JSON, or a setting there has another shape). Add these by hand:`,
        ...p.rules.map((r) => `${PAD}+ ${r}`),
      ];
    default: {
      const never: never = p;
      return never;
    }
  }
}
