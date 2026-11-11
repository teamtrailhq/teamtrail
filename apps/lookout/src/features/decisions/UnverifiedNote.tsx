import type { AuditDecision } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';

/**
 * A decision derived from text (a resolution comment, the map's Decisions so far): anyone who can edit the tracker
 * wrote it, so it is never shown as the human's call.
 */
export function UnverifiedNote({ d }: { d: Pick<AuditDecision, 'derived'> }) {
  if (!d.derived) return null;
  return (
    <MetaLine
      className="d-section"
      parts={['Unverified · read from text anyone who can edit the tracker wrote, not a decision Teamtrail recorded']}
    />
  );
}
