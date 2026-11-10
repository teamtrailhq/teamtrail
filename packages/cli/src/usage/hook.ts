import fs from 'node:fs';
import path from 'node:path';
import { BRAND, agentPaths, shellLine, type HostSessionLink } from '@teamtrail/core';
import { writeLocalJson } from '@teamtrail/core/agents';
import { writeIfChanged } from '../files';
import type { SelfCommand } from '../selfCommand';

/** The SessionStart payload fields this hook reads. */
interface SessionStartInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  source?: string;
}

/**
 * `teamtrail hook claude`: Claude Code SessionStart hook. Records where the new
 * session's transcript is, so the MCP server reads usage from the right file
 * (also after /clear or /resume). Never prints: SessionStart stdout would be
 * added to the model's context.
 */
export function recordClaudeSession(input: string, opts: { dir: string; env?: NodeJS.ProcessEnv; cwd?: string }) {
  let p: SessionStartInput;
  try {
    p = JSON.parse(input) as SessionStartInput;
  } catch {
    return undefined;
  }
  if (!p.session_id || !p.transcript_path) return undefined;
  const env = opts.env ?? process.env;
  const project = env.CLAUDE_PROJECT_DIR || p.cwd || opts.cwd || process.cwd();
  const root = path.resolve(project, opts.dir);
  const link: HostSessionLink = {
    agent: 'claude-code',
    hostSessionId: p.session_id,
    transcriptPath: p.transcript_path,
    cwd: p.cwd,
    source: p.source,
    at: Date.now(),
  };
  const rel = agentPaths.host('claude-code', p.session_id);
  writeLocalJson(root, rel, link);
  return path.join(root, rel);
}

export async function readStdin(timeoutMs = 5000) {
  if (process.stdin.isTTY) return '';
  return new Promise<string>((resolve) => {
    let s = '';
    const t = setTimeout(() => resolve(s), timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (s += c));
    process.stdin.on('end', () => {
      clearTimeout(t);
      resolve(s);
    });
  });
}

/**
 * The SessionStart hook command, as the shell Claude Code runs it in reads it: the same pinned CLI as the MCP
 * server, and `--dir` (only when the tracker folder is not the default) quoted as one word, whatever is in it.
 */
export function hookCommand(dir: string | undefined, self: SelfCommand) {
  const where = dir && dir !== BRAND.dataDir ? ['--dir', dir] : [];
  return shellLine([self.command, ...self.args, 'hook', 'claude', ...where]);
}

interface HookEntry {
  matcher?: string;
  hooks?: { type?: string; command?: string; timeout?: number }[];
}

/**
 * Add the usage hook to `.claude/settings.local.json` (personal, like the local-scope
 * MCP registration), keeping every other setting. Replaces an older teamtrail hook.
 */
export function installClaudeHook(file: string, dir: string | undefined, self: SelfCommand) {
  let settings: { hooks?: Record<string, HookEntry[]> } & Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try {
      settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return 'skipped (settings file is not valid JSON)';
    }
  }
  const command = hookCommand(dir, self);
  const ours = (h: { command?: string }) =>
    !!h.command && new RegExp(`(\\b(${BRAND.npm}|${BRAND.slug})\\b|cli\\.js).*\\bhook claude\\b`).test(h.command);
  const entries = settings.hooks?.SessionStart ?? [];
  const kept = entries
    .map((e) => ({ ...e, hooks: (e.hooks ?? []).filter((h) => !ours(h)) }))
    .filter((e) => e.hooks.length);
  const next = {
    ...settings,
    hooks: { ...settings.hooks, SessionStart: [...kept, { hooks: [{ type: 'command', command, timeout: 30 }] }] },
  };
  return writeIfChanged(file, `${JSON.stringify(next, null, 2)}\n`);
}
