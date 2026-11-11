import os from 'node:os';
import path from 'node:path';

/** Claude Code's user settings: `$CLAUDE_CONFIG_DIR/settings.json`, else `~/.claude/settings.json`. */
export const claudeSettingsFile = (env: NodeJS.ProcessEnv = process.env) =>
  path.join(env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json');
