import path from 'node:path';

const PAD = '                  ';

/**
 * What `connect codex` prints about the config folder. Codex can deny a folder only through a permissions profile
 * made its default (`default_permissions`), and that replaces how it picks its sandbox for every folder: a folder
 * it would open read-only would open as a workspace. That is the user's call, so connect prints the profile instead
 * of writing it. Verified with Codex 0.164.0-alpha (`codex sandbox`): the profile makes the folder unreadable and
 * unwritable to its commands, and MCP servers it starts, Teamtrail's included, are not sandboxed by it.
 */
export function codexProtectionLines(dirs: string[], codexHome: string): string[] {
  const config = path.join(codexHome, 'config.toml');
  return [
    `  Config folder   readable by Codex's commands: ${dirs.join(' and ')} (this machine's key, approvals, credentials).`,
    `${PAD}Its default sandbox (workspace-write) keeps its commands' writes inside the repo, so not there: leave it on.`,
    `${PAD}To deny reading too, make this profile`,
    `${PAD}your default in ${config} (it replaces sandbox_mode; check it suits how you run Codex):`,
    '',
    `  default_permissions = "teamtrail"`,
    `  [permissions.teamtrail]`,
    `  extends = ":workspace"`,
    `  [permissions.teamtrail.filesystem]`,
    ...dirs.map((d) => `  ${JSON.stringify(d)} = "deny"`),
    '',
    `${PAD}Teamtrail's own MCP server is not affected by it. To remove: delete those lines. --no-protect-config skips this note.`,
  ];
}
