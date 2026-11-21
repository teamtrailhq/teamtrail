import type { ReactNode } from 'react';
import { Button, MoreMenu } from '../../components/ui';
import type { useTicketActions } from './useTicketActions';
import type { TicketView } from './useTicketView';

/**
 * Every ticket action in one row, one size: the next action as the primary button (merging a done ticket's pull
 * request when a server merges them, mergeAction.ts), the agent's chat, `trailing` (the bubble's Full ticket), and "⋯"
 * for the rest, at the row's end.
 * What an action said back (an error, "Copied") reads under it. While a form an action opened is open (`formOpen`),
 * its own submit is the one action: the bar keeps only `trailing`, so nothing shows twice.
 */
export function ActionBar(props: {
  v: TicketView;
  bar: ReturnType<typeof useTicketActions>;
  onOpenChat: (sessionId: string) => void;
  trailing?: ReactNode;
  formOpen?: boolean;
}) {
  const { v, bar, formOpen } = props;
  const primary = formOpen ? undefined : bar.primary;
  const session = v.session;
  const chat = !formOpen && session && primary?.id !== 'answer';
  return (
    <>
      <div className="actions action-bar">
        {primary && (
          <Button variant={bar.variant} data-tip={primary.tip} onClick={primary.onSelect}>
            {primary.label}
          </Button>
        )}
        {chat && (
          <Button onClick={() => props.onOpenChat(session.id)} data-tip={`The conversation with ${session.agent}`}>
            Open chat
          </Button>
        )}
        {props.trailing && <span className="action-bar-end">{props.trailing}</span>}
        {!formOpen && <MoreMenu items={bar.menu} label="More ticket actions" />}
      </div>
      {bar.error && <p className="vf-err">{bar.error}</p>}
      {bar.note && <p className="t-meta bar-note">{bar.note}</p>}
    </>
  );
}
