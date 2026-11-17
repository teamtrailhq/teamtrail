import type { CheckFinding, RepoFiles } from '../model/checkScreening';
import type { VerificationConfig } from '../model/verification';
import { screenChecks } from './screenChecks';

/**
 * Screening of a verification config's checks (screenChecks.ts): the ones named, else every check it defines. None
 * without a config or without the repo's files to read (`files` undefined: no checkout here to tell from).
 */
export async function screenConfig(o: {
  config?: VerificationConfig;
  files?: RepoFiles;
  names?: string[];
}): Promise<CheckFinding[]> {
  const { config, files } = o;
  if (!config || !files) return [];
  const names = (o.names ?? Object.keys(config.checks)).filter((n) => config.checks[n]);
  const checks = names.map((name) => ({ name, run: config.checks[name].run, cwd: config.checks[name].cwd }));
  return screenChecks({ checks, files });
}
