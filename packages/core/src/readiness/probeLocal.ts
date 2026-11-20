import type { RepoFiles } from '../model/checkScreening';
import type { LocalProbes } from '../model/readiness';
import type { RepoProfile } from '../model/repoProfile';
import type { VerificationConfig } from '../model/verification';
import { checkEnv } from '../verification/checkEnv';
import { dependencyFolder } from './dependencyFolder';
import { findBrowser } from './findBrowser';
import { findProgram } from './findProgram';
import { profileNeeds } from './profileNeeds';
import { programVersion, shimOf } from './programVersion';
import { serviceReachable } from './serviceReachable';
import { toolchainProgram } from './toolchainProgram';

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** The bare programs the approved checks and setup steps start (`npm`, `go`); a path is screening's to read. */
function programsOf(config: VerificationConfig | undefined): string[] {
  const argv0 = [...Object.values(config?.checks ?? {}), ...Object.values(config?.setup ?? {})].map((c) => c.run[0]);
  return [...new Set(argv0.filter((p): p is string => !!p && !/[\\/]/.test(p)))].sort();
}

async function toolchains(o: { profile: RepoProfile; repoRoot: string; env: NodeJS.ProcessEnv }) {
  const out: LocalProbes['toolchains'] = {};
  const names = [...new Set(o.profile.units.map((u) => u.toolchain?.name).filter((n): n is string => !!n))].sort();
  for (const name of names) {
    const tool = toolchainProgram(name);
    if (!tool) continue;
    const file = tool.programs.map((p) => findProgram(p, o.env)).find(Boolean);
    if (!file) {
      out[name] = {};
      continue;
    }
    const managed = shimOf(file);
    const version = managed
      ? undefined
      : await programVersion({ file, args: tool.versionArgs, repoRoot: o.repoRoot, env: o.env });
    out[name] = { path: file, ...(version ? { version } : {}), ...(managed ? { managed } : {}) };
  }
  return out;
}

async function installed(profile: RepoProfile, files: RepoFiles) {
  const out: LocalProbes['installed'] = {};
  if (!files.seesInstalls) return out;
  for (const unit of profile.units) {
    const folders = dependencyFolder(unit);
    if (!folders) continue;
    const kinds = await Promise.all(folders.map((f) => files.kind(join(unit.dir, f)).catch(() => undefined)));
    out[unit.dir] = kinds.some(Boolean);
  }
  return out;
}

async function services(profile: RepoProfile, env: NodeJS.ProcessEnv) {
  const out: LocalProbes['services'] = {};
  const names = [...new Set(profileNeeds(profile, 'service').map((n) => n.name))].sort();
  const reached = await Promise.all(names.map((n) => serviceReachable(n, env)));
  names.forEach((n, i) => {
    if (reached[i] !== undefined) out[n] = reached[i];
  });
  return out;
}

/** The variable names the tests need, split by whether the checks would get them. Names only, never a value. */
function variables(profile: RepoProfile, source: NodeJS.ProcessEnv) {
  const { env, withheld } = checkEnv(source);
  const passedNames = new Set(Object.keys(env).map((k) => k.toUpperCase()));
  const withheldNames = new Set(withheld.map((k) => k.toUpperCase()));
  const needed = [...new Set(profileNeeds(profile, 'variable').map((n) => n.name))].sort();
  return {
    passed: needed.filter((n) => passedNames.has(n.toUpperCase())),
    withheld: needed.filter((n) => withheldNames.has(n.toUpperCase())),
  };
}

/**
 * What this machine has for the repo's checks: the programs they start on the checks' PATH, the toolchains the repo
 * pins (and their versions: `<program> --version` for a binary outside the repo only, programVersion.ts), the
 * dependency folders, a browser, the services the tests connect to (127.0.0.1 only) and which needed variable names
 * the checks get. Run only where the checks run (the person's machine), never for a checkout read from elsewhere.
 */
export async function probeLocal(o: {
  repoRoot: string;
  files: RepoFiles;
  profile: RepoProfile;
  config?: VerificationConfig;
  source?: NodeJS.ProcessEnv;
}): Promise<LocalProbes> {
  const source = o.source ?? process.env;
  const env = checkEnv(source).env;
  const programs: LocalProbes['programs'] = {};
  for (const p of programsOf(o.config)) {
    const file = findProgram(p, env);
    programs[p] = file ? { path: file } : {};
  }
  return {
    programs,
    toolchains: await toolchains({ profile: o.profile, repoRoot: o.repoRoot, env }),
    installed: await installed(o.profile, o.files),
    browser: profileNeeds(o.profile, 'browser').length ? findBrowser(env) : { found: false },
    services: await services(o.profile, env),
    variables: variables(o.profile, source),
  };
}
