import { LabelLine } from '../../components/ui';

/** The chat's ticket on one line (full text on hover), then its trail. */
export function ConversationTicket(props: { ticket?: { key: string; title: string }; trail?: string }) {
  const { ticket } = props;
  return (
    <div className="comms-ticket">
      <div className="t-title" title={ticket && `${ticket.key} ${ticket.title}`}>
        {ticket?.title}
      </div>
      <LabelLine parts={[props.trail]} />
    </div>
  );
}
