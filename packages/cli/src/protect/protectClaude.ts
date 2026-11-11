import fs from 'node:fs';
import { claudeRules } from './claudeRules';
import { writeSettings } from './writeSettings';

/** What protecting the config folder did to Claude Code's settings file. */
export type ClaudeProtection =
  | { kind: 'added'; file: string; added: string[] }
  | { kind: 'unchanged'; file: string }
  | { kind: 'unreadable'; file: string; rules: string[] }
  | { kind: 'pattern-path'; file: string; rules: string[] };

/**
 * Characters Claude Code reads as pattern syntax in a rule's path (globs, rule brackets, escapes). A folder named
 * with one would be matched as something else, or the rule refused, and the folder left open while connect said it
 * was protected; such a path is never written, the rules are printed with a warning instead.
 */
const PATTERN = /[*?[\]{}()\\!]/;

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function read(file: string): Json | undefined {
  if (!fs.existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** The object at `key` in `parent`, created when missing; undefined when something else is there. */
function child(parent: Json, key: string): Json | undefined {
  if (parent[key] === undefined) parent[key] = {};
  const v = parent[key];
  return isObject(v) ? v : undefined;
}

/** Appends what's missing from `values` to the list at `key`; the entries added, or undefined if not a list. */
function append(o: { parent: Json; key: string; values: string[]; label: string }): string[] | undefined {
  const list = o.parent[o.key] ?? [];
  if (!Array.isArray(list)) return undefined;
  const missing = o.values.filter((v) => !list.includes(v));
  o.parent[o.key] = [...list, ...missing];
  return missing.map((v) => `${o.label}: ${v}`);
}

/** Every rule, merged into the settings; undefined when the file's shape leaves no clean place for one. */
function merge(s: Json, dirs: string[]): string[] | undefined {
  const rules = claudeRules(dirs);
  const permissions = child(s, 'permissions');
  const sandbox = child(s, 'sandbox');
  const filesystem = sandbox && child(sandbox, 'filesystem');
  if (!permissions || !filesystem) return undefined;
  const parts = [
    append({ parent: permissions, key: 'deny', values: rules.deny, label: 'permissions.deny' }),
    append({ parent: filesystem, key: 'denyRead', values: rules.denyRead, label: 'sandbox.filesystem.denyRead' }),
    append({ parent: filesystem, key: 'denyWrite', values: rules.denyWrite, label: 'sandbox.filesystem.denyWrite' }),
  ];
  return parts.some((p) => !p) ? undefined : parts.flatMap((p) => p!);
}

/**
 * Adds deny rules for `dirs` to Claude Code's user settings, keeping everything else in the file. Idempotent. A file
 * it can't read as plain JSON (comments, another shape) is never rewritten: the rules come back to add by hand.
 */
export function protectClaude(file: string, dirs: string[]): ClaudeProtection {
  const all = claudeRules(dirs);
  const byHand = [
    ...all.deny.map((r) => `permissions.deny: ${r}`),
    ...all.denyRead.map((d) => `sandbox.filesystem.denyRead: ${d}`),
    ...all.denyWrite.map((d) => `sandbox.filesystem.denyWrite: ${d}`),
  ];
  if (dirs.some((d) => PATTERN.test(d))) return { kind: 'pattern-path', file, rules: byHand };
  const settings = read(file);
  const added = settings && merge(settings, dirs);
  if (!settings || !added) return { kind: 'unreadable', file, rules: byHand };
  if (!added.length) return { kind: 'unchanged', file };
  writeSettings(file, settings);
  return { kind: 'added', file, added };
}
