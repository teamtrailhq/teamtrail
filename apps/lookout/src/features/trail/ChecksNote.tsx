import { settingsSectionLink } from '../../lib/settingsSectionLink';
import { useReadiness } from '../readiness';
import { checksMissing } from './checksMissing';

/**
 * Under Start the trail, while the project has no approved checks: what done must pass is still to choose, with the
 * way to Settings → Verification. Plain: discovery runs first, so nothing waits on it yet. Gone as soon as checks
 * are approved (readiness reloads on verification.json and on this machine's approvals). `onOpen` before Settings
 * opens (New trail closes).
 */
export function ChecksNote(props: { onOpen?: () => void }) {
  const { view } = useReadiness();
  if (!checksMissing(view)) return null;
  const link = settingsSectionLink('verification');
  return (
    <p className="checks-note">
      Choose what done must pass before building starts.{' '}
      <a
        href={link.href}
        onClick={(e) => {
          props.onOpen?.();
          link.onClick(e);
        }}
      >
        Set checks
      </a>
    </p>
  );
}
