import { BRAND } from '../model/brand';
import type { ProjectEntry } from '../model/project';
import { readProjects } from './projectsFile';
import { registerProject } from './registerProject';

/**
 * What `teamtrail mcp` and `connect` do on start: add their repo to the registry, unless `--no-register`,
 * `$TEAMTRAIL_NO_REGISTER` or the registry's own setting says not to. Never throws: an agent must start anyway.
 */
export function autoRegister(input: {
  configDir: string;
  root: string;
  optOut?: boolean;
  env?: Record<string, string | undefined>;
}): ProjectEntry | undefined {
  const env = input.env ?? process.env;
  const envOff = !!env[BRAND.noRegisterEnv] && env[BRAND.noRegisterEnv] !== '0';
  if (input.optOut || envOff) return undefined;
  try {
    if (!readProjects(input.configDir).autoRegister) return undefined;
    return registerProject({ configDir: input.configDir, root: input.root }).entry;
  } catch {
    return undefined;
  }
}
