import { BRAND, DEFAULT_CONFIG, VERIFICATION_LEVELS, type MapDoc } from '@teamtrail/core';
import { useState } from 'react';
import { Choice, MetaLine } from '../../components/ui';
import { TRAIL_LEAD } from '../../lib';
import { LEVEL_HELP, LEVEL_TEXT, verificationApi } from '../../lib/verification';
import { SettingsSection } from './SettingsSection';
import { useVerificationConfig } from './useVerificationConfig';
import { VerificationSetup } from './VerificationSetup';

/** The trail's level is picked here; checks are changed in the repo, so an agent cannot edit what verifies its own work. */
export function VerificationSection(props: { map?: MapDoc }) {
  const view = useVerificationConfig();
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
      {!view.exists && <VerificationSetup file={file} />}
      {c && view.exists && (
        <>
          <div className="sync-line ok" title={view.hash}>
            <span className="dot" />
            <span>
              <span className="t-code">{file}</span> · {c.run.length} checks run on every completion
            </span>
          </div>
          <MetaLine
            className="set-hint"
            parts={[
              `New trails start at ${LEVEL_TEXT[c.default]}`,
              `${c.maxAttempts} attempts before it waits for you`,
              c.failFast && 'Stops at the first failure',
            ]}
          />
          <div className="vf-checks">
            {Object.entries(c.checks).map(([name, spec]) => (
              <div key={name} className="vf-check">
                <span className="t-code">{c.run.includes(name) ? name : `${name} (on request)`}</span>
                <code>{spec.run.join(' ')}</code>
                <span className="dim">
                  {spec.timeoutSec} s{spec.cwd && spec.cwd !== '.' ? ` · in ${spec.cwd}` : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <span className="set-hint t-meta">
        Teamtrail never edits {file}. Change checks in the repo, so no agent can change what verifies its own work.
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
