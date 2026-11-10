import { DEFAULT_WORKSPACE_SETTINGS, type WorkspaceSettings } from './workspace';
import { dirProblem } from './dirProblem';

const KEYS = new Set(['v', 'worktrees', 'dir']);

/** Reads `workspaces.json`, listing every problem; unknown keys are errors. */
export function parseWorkspaceSettings(text: string): { settings?: WorkspaceSettings; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { errors: [`not valid JSON: ${(e as Error).message}`] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['must be a JSON object'] };
  const o = raw as Record<string, unknown>;
  const errors = Object.keys(o)
    .filter((k) => !KEYS.has(k))
    .map((k) => `unknown key "${k}"`);
  if (o.v !== 1) errors.push('"v" must be 1');
  if (o.worktrees !== undefined && typeof o.worktrees !== 'boolean') errors.push('"worktrees" must be true or false');
  if (o.dir !== undefined && (typeof o.dir !== 'string' || !o.dir.trim())) errors.push('"dir" must be a folder path');
  else if (typeof o.dir === 'string' && dirProblem(o.dir.trim())) errors.push(`"dir" ${dirProblem(o.dir.trim())}`);
  if (errors.length) return { errors };
  const settings: WorkspaceSettings = { ...DEFAULT_WORKSPACE_SETTINGS, worktrees: o.worktrees === true };
  if (typeof o.dir === 'string') settings.dir = o.dir.trim();
  return { settings, errors };
}

export function serializeWorkspaceSettings(s: WorkspaceSettings) {
  return `${JSON.stringify(s, null, 2)}\n`;
}
