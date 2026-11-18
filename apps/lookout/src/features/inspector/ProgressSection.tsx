import { DetailSection, Fact } from '../../components/ui';
import { ChecklistSummary } from '../guides';
import { AttemptsSummary, WaivedChecks } from '../verification';
import { LeaseFacts } from './LeaseFacts';
import type { TicketView } from './useTicketView';

/**
 * What has happened on the ticket so far: the claim, the branch or finished workspace, the completions and the checklist answers. Only once there is some.
 */
export function ProgressSection({ v, onUndoWaiver }: { v: TicketView; onUndoWaiver: () => void }) {
  const attempts = v.verification?.attempts.length ?? 0;
  if (!v.lease && !v.workspace && !attempts) return null;
  const mapId = v.snap.map.id;
  return (
    <DetailSection label="Progress" className="ticket-progress">
      <dl className="facts">
        {v.lease && <LeaseFacts lease={v.lease} now={v.now} />}
        {v.workspace && (
          <Fact label="Workspace">
            <code className="t-code">{v.workspace.branch}</code>
            <span className="t-meta ws-path" title={v.workspace.path}>
              {v.workspace.path}
            </span>
          </Fact>
        )}
        {attempts > 0 && v.verification && (
          <Fact label="Attempts">
            <AttemptsSummary data={v.verification} />
          </Fact>
        )}
        {attempts > 0 && <ChecklistSummary mapId={mapId} ticketId={v.t.id} />}
        <WaivedChecks waivers={v.verification?.waivers ?? []} onUndo={onUndoWaiver} />
      </dl>
    </DetailSection>
  );
}
