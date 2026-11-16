import { ChecksEditor } from './ChecksEditor';
import { ChecksList } from './ChecksList';
import { ScopeSetting } from './ScopeSetting';
import type { VerificationConfigView } from './useVerificationConfig';

/**
 * The checks every completion runs, and what a change outside the declared files does: edited on the machine
 * Teamtrail runs on, read elsewhere.
 */
export function VerificationChecks(props: { view: VerificationConfigView; local?: boolean; file: string }) {
  const { view, local, file } = props;
  const c = view.config;
  return (
    <>
      {local && <ChecksEditor key={view.approval?.base ?? 'none'} view={view} />}
      {!local && !view.exists && (
        <span className="set-hint t-meta">No checks yet. They're set on the machine Teamtrail runs on.</span>
      )}
      {!local && c && view.exists && <ChecksList config={c} file={file} hash={view.hash} />}
      {c && view.exists && <ScopeSetting view={view} local={local} />}
    </>
  );
}
