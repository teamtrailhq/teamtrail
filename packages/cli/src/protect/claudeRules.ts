/**
 * What Claude Code is told about the config folder, in its user settings:
 * - `permissions.deny`: `Read(//<abs>/**)` and `Edit(//<abs>/**)` keep its own file tools (Read, Edit, Write and
 *   the searches) out of the folder. `//` starts an absolute path in a permission rule.
 * - `sandbox.filesystem.denyRead` / `denyWrite`: the same folder for the commands it runs in its sandbox, when the
 *   user turns the sandbox on. Claude Code already merges Read and Edit deny rules into these; naming the folder
 *   here too keeps it covered if that ever changes, and says so where sandbox settings are read.
 * Neither applies to MCP servers it starts, which run outside its permission checks and its sandbox: Teamtrail's
 * own server keeps reading its machine key (verified with Claude Code 2.1.311; see the PR).
 */
export interface ClaudeRules {
  deny: string[];
  denyRead: string[];
  denyWrite: string[];
}

const absoluteRule = (tool: 'Read' | 'Edit', dir: string) => `${tool}(/${dir.replace(/\/+$/, '')}/**)`;

export function claudeRules(dirs: string[]): ClaudeRules {
  return {
    deny: dirs.flatMap((d) => [absoluteRule('Read', d), absoluteRule('Edit', d)]),
    denyRead: dirs,
    denyWrite: dirs,
  };
}
