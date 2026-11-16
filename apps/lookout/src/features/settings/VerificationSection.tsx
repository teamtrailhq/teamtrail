import { BRAND, DEFAULT_CONFIG, VERIFICATION_LEVELS, type MapDoc } from '@teamtrail/core';
import { useState } from 'react';
import { Choice } from '../../components/ui';
import { TRAIL_LEAD } from '../../lib';
import { LEVEL_HELP, LEVEL_TEXT, verificationApi } from '../../lib/verification';
import { ChecksEditor } from './ChecksEditor';
import { ChecksList } from './ChecksList';
import { settingsHref } from './settingsHref';
import { SettingsSection } from './SettingsSection';
import { useThisMachine } from './useThisMachine';
import { useVerificationConfig } from './useVerificationConfig';

/**
 * The trail's level, and the checks: set here on the machine Teamtrail runs on (approved as they're saved), read
 * elsewhere. An agent never edits what verifies its own work: a change in the repo runs nothing until approved.
 */
export function VerificationSection(props: { map?: MapDoc }) {
  const view = useVerificationConfig();
  const local = useThisMachine();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const map = props.map;
  const c = view.config;
  const file = `${BRAND.dataDir}/${view.file}`;
  const level = map?.verification ?? 'off';
  const types = (c ?? DEFAULT_CONFIG).appliesTo.join(' and ');
  return (
    <SettingsSection title="Verification">
      <p className="vf-intro">
        When an agent says a ticket is done, Teamtrail can check the work before the ticket closes. This applies to{' '}
        {types} tickets. Research, junction and prototype tickets close as soon as they are answered.
      </p>
      {map && (
        <>
          <span className="set-field-label">How much checking for trail {map.key}</span>
          <div className="choice-row vf-levels">
            {VERIFICATION_LEVELS.map((l) => (
              <Choice
                key={l}
                on={level === l}
                title={LEVEL_TEXT[l]}
                sub={LEVEL_HELP[l]}
                onClick={() => {
                  setError(undefined);
                  verificationApi
                    .act({ action: 'level', mapId: map.id, level: l, by: TRAIL_LEAD })
                    .catch((e: Error) => setError(e.message));
                }}
              />
            ))}
          </div>
          {level !== 'off' && !c && (
            <div className="sync-line alert">
              <span className="dot" />
              <span>No working checks yet, so completions at this level stop and wait for you.</span>
            </div>
          )}
          {error && <span className="vf-err">{error}</span>}
        </>
      )}
      {view.errors.length > 0 && (
        <>
          <div className="sync-line alert" title={view.hash}>
            <span className="dot" />
            <span>{file} has errors. Completions that need checks wait for you until it is fixed.</span>
          </div>
          <ul className="vf-errors">
            {view.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </>
      )}
      {view.approval?.waiting && (
        <div className="sync-line alert">
          <span className="dot" />
          <span>
            Its commands don't run on this machine until you approve them.{' '}
            <a href={settingsHref(location.href, { group: 'project', section: 'approvals' })}>Review the commands</a>
          </span>
        </div>
      )}
      {local && <ChecksEditor key={view.approval?.base ?? 'none'} view={view} />}
      {!local && !view.exists && (
        <span className="set-hint t-meta">No checks yet. They're set on the machine Teamtrail runs on.</span>
      )}
      {!local && c && view.exists && <ChecksList config={c} file={file} hash={view.hash} />}
      <span className="set-hint t-meta">
        Saved here, checks are approved as you save them. A change to {file} made in the repo, by an agent or a
        teammate, runs nothing until you approve it.
      </span>
      <span className="set-hint t-meta">
        Checks run on this machine as you, with no sandbox. Teamtrail passes them only the environment variables they
        need (more go in <code>TEAMTRAIL_CHECK_ENV</code>), but a check can still read your files (~/.aws, ~/.npmrc,
        ~/.ssh, ~/.kube, ~/.docker, the GitHub CLI&apos;s login, Teamtrail&apos;s own credentials) and use your SSH
        agent. That&apos;s why a changed check command needs your approval: you approve the command line, so read what
        it runs.
      </span>
    </SettingsSection>
  );
}
