import { LearnMore } from './LearnMore';
import { settingsHref } from './settingsHref';

/** What approving checks means on this machine: they run as you, unsandboxed; the details behind Learn more. */
export function ChecksRunAsYou(props: { file: string }) {
  const variables = settingsHref(location.href, { group: 'project', section: 'check-variables' });
  return (
    <div className="sec-intro">
      <p className="vf-intro">Checks run as you, with no sandbox: approve a command only once you know what it runs.</p>
      <LearnMore
        points={[
          `Saving here approves the checks you save. A change to ${props.file} made in the repo, by an agent or a teammate, runs nothing until you approve it.`,
          <>
            Checks get only the environment variables they need (more under <a href={variables}>Check variables</a>),
            but they can still read your files (~/.aws, ~/.npmrc, ~/.ssh, ~/.kube, ~/.docker, the GitHub CLI&apos;s
            login, Teamtrail&apos;s own credentials) and use your SSH agent.
          </>,
          'You approve the command line, not what it runs: scripts and config it reads can still change, and agents can edit them.',
        ]}
      />
    </div>
  );
}
