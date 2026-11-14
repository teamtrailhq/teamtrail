import path from 'node:path';

/** The project's personal Claude Code settings, `.claude/settings.local.json`: where connect writes for this repo. */
export const claudeLocalSettings = (cwd: string) => path.join(cwd, '.claude', 'settings.local.json');
