import { BRAND, DEFAULT_CONFIG, VERIFICATION_LEVELS, type MapDoc } from '@teamtrail/core';
import { useState } from 'react';
import { Choice } from '../../components/ui';
import { TRAIL_LEAD } from '../../lib';
import { LEVEL_HELP, LEVEL_TEXT, verificationApi } from '../../lib/verification';
import { MainChecksSetting } from '../main-checks';
import { ChecksRunAsYou } from './ChecksRunAsYou';
import { SectionIntro } from './SectionIntro';
import { settingsHref } from './settingsHref';
import { SettingsSection } from './SettingsSection';
import { useThisMachine } from './useThisMachine';
import { useVerificationConfig } from './useVerificationConfig';
import { VerificationChecks } from './VerificationChecks';

/**
 * The trail's level, and the checks: set here on the machine Teamtrail runs on (approved as they're saved), read
 * elsewhere. An agent never edits what verifies its own work: a change in the repo runs nothing until approved.
 */
export function VerificationSection(props: { map?: MapDoc }) {
  const { view } = useVerificationConfig();
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
      <SectionIntro
        lead={`Check an agent's work before its ticket closes.`}
        points={[`This applies to ${types} tickets. Research, junction and prototype tickets close once answered.`]}
      />
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
      <VerificationChecks view={view} local={local} file={file} />
      {map && <MainChecksSetting mapId={map.id} />}
      <ChecksRunAsYou file={file} />
    </SettingsSection>
  );
}
