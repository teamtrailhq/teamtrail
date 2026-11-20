import { BRAND } from '../model/brand';
import type { LocalProbes, ReadinessFinding } from '../model/readiness';
import type { RepoProfile } from '../model/repoProfile';
import { CHECK_ENV } from '../verification/checkEnv';
import { folderLabel } from './folderLabel';
import { profileNeeds } from './profileNeeds';
import { servicePort } from './servicePort';
import type { ReadinessInput } from './types';

const MAX_VARIABLES = 12;
const where = (unit: string | undefined) => (unit === undefined ? 'the repo' : folderLabel(unit));

/** One finding for every unit whose tests drive a browser, when none is here. */
function browser(profile: RepoProfile, probes: LocalProbes): ReadinessFinding[] {
  const needs = profileNeeds(profile, 'browser');
  if (!needs.length || probes.browser.found) return [];
  const units = [...new Set(needs.map((n) => where(n.unit)))];
  return [
    {
      id: 'browser',
      kind: 'browser',
      level: 'warns',
      text: `No browser found for the tests in ${units.join(', ')}`,
      why: needs.map((n) => n.why).join('; '),
      howTo: ['Install Chrome or Chromium, or set CHROME_BIN to one, or run: npx playwright install chromium'],
    },
  ];
}

/** The services the tests connect to that don't answer on 127.0.0.1. */
function services(profile: RepoProfile, probes: LocalProbes): ReadinessFinding[] {
  const needs = profileNeeds(profile, 'service');
  const down = [...new Set(needs.map((n) => n.name))].filter((name) => probes.services[name] === false);
  return down.map((name) => {
    const port = servicePort(name);
    const of = needs.filter((n) => n.name === name);
    return {
      id: `service:${name}`,
      kind: 'service',
      level: 'warns',
      text:
        name === 'docker'
          ? "Docker isn't running here; the tests start containers"
          : `${name} isn't reachable on 127.0.0.1:${port}`,
      why: of.map((n) => n.why).join('; '),
      howTo: [`Start ${name} yourself (for example with docker compose up -d), then check again`],
    };
  });
}

/** One variable the tests read that the checks wouldn't get: withheld here, or not set where Teamtrail runs. */
function variable(o: { name: string; why: string; secret: boolean; withheld: boolean }): ReadinessFinding {
  const state = o.withheld ? 'is set here but not passed to checks' : `isn't set where ${BRAND.slug} runs`;
  const secret = o.secret ? '; it reads like a secret: anything a check runs (an agent’s test too) can read it' : '';
  return {
    id: `variable:${o.name}`,
    kind: 'variable',
    level: 'warns',
    text: `${o.name} ${state}`,
    why: `${o.why}${secret}`,
    howTo: [
      `${CHECK_ENV}="${o.name}" ${BRAND.slug}   (start ${BRAND.slug} with it set and named; names only, never in the repo)`,
    ],
  };
}

/** The variable names the tests seem to read that the checks wouldn't get. Names only, never a value. */
function variables(profile: RepoProfile, probes: LocalProbes): ReadinessFinding[] {
  const passed = new Set(probes.variables.passed);
  const withheld = new Set(probes.variables.withheld);
  const needs = profileNeeds(profile, 'variable').filter((n) => !passed.has(n.name));
  const names = [...new Set(needs.map((n) => n.name))].sort().slice(0, MAX_VARIABLES);
  return names.map((name) => {
    const of = needs.filter((n) => n.name === name);
    const why = `named in ${of.map((n) => n.why).join('; ')}`;
    return variable({ name, why, secret: of.some((n) => n.secretShaped), withheld: withheld.has(name) });
  });
}

/** What the tests need beyond the code that this machine doesn't give them: a browser, services, variables. */
export function needFindings(input: ReadinessInput): ReadinessFinding[] {
  const probes = input.probes;
  if (!probes) return [];
  const { profile } = input;
  return [...browser(profile, probes), ...services(profile, probes), ...variables(profile, probes)];
}
