import { Button, MoreMenu } from '../../components/ui';
import { MergeOnApprove } from '../proof';
import type { useTicketActions } from './useTicketActions';
import type { TicketView } from './useTicketView';

/**
 * Every ticket action in one row, one size: the next action as the primary button, the agent's chat, and "⋯" for
 * the rest. What an action said back (an error, "Copied") reads under it.
 */
export function ActionBar(props: {
  v: TicketView;
  bar: ReturnType<typeof useTicketActions>;
  onOpenChat: (sessionId: string) => void;
}) {
  const { v, bar } = props;
  const { primary } = bar;
  const session = v.session;
  const chat = session && primary?.id !== 'answer';
  const done = v.t.state === 'closed' && v.t.closeReason === 'completed';
  return (
    <>
      <div className="actions action-bar">
        {primary && (
          <Button variant={bar.variant} data-tip={primary.tip} onClick={primary.onSelect}>
            {primary.label}
          </Button>
        )}
        {done && <MergeOnApprove mapId={v.snap.map.id} ticketId={v.t.id} proof={v.proof} />}
        {chat && (
          <Button onClick={() => props.onOpenChat(session.id)} data-tip={`The conversation with ${session.agent}`}>
            Open chat
          </Button>
        )}
        <MoreMenu items={bar.menu} label="More ticket actions" />
      </div>
      {bar.error && <p className="vf-err">{bar.error}</p>}
      {bar.note && <p className="t-meta bar-note">{bar.note}</p>}
    </>
  );
}
