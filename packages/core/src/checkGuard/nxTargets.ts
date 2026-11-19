import { commandsOf } from './commandsOf';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A project.json read for the guard: its name and its targets, each as JSON text to compare. */
export interface NxProject {
  name?: string;
  targets: Record<string, unknown>;
}

/** A project.json's text: undefined when missing, unread or not JSON. */
export function nxProject(text: string | null | undefined): NxProject | undefined {
  if (text == null) return undefined;
  try {
    const raw: unknown = JSON.parse(text);
    if (!isObj(raw)) return undefined;
    return {
      name: typeof raw.name === 'string' ? raw.name : undefined,
      targets: isObj(raw.targets) ? raw.targets : {},
    };
  } catch {
    return undefined;
  }
}

/**
 * The commands an `nx:run-commands` target runs (`options.command`, `options.commands` as strings or `{ command }`),
 * each with the folder it runs in relative to the workspace root (`options.cwd`, else the root).
 */
export function nxCommands(target: unknown): { cmd: string[]; cwd?: string }[] {
  const options = isObj(target) && isObj(target.options) ? target.options : {};
  const cwd = typeof options.cwd === 'string' ? options.cwd : undefined;
  const lines = [options.command, ...(Array.isArray(options.commands) ? options.commands : [])]
    .map((c) => (isObj(c) ? c.command : c))
    .filter((c): c is string => typeof c === 'string');
  return lines.flatMap(commandsOf).map((cmd) => ({ cmd, cwd }));
}
