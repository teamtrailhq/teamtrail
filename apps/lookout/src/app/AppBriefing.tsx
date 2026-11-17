import type { MapSnapshot, PendingQuestion, SessionInfo } from '@teamtrail/core';
import { BriefingDialog } from '../features/briefing';
import type { Breakpoint, useBriefing } from '../hooks';

/** "While you were away", wired to the app: every jump dismisses it first. */
export function AppBriefing(props: {
  brief: ReturnType<typeof useBriefing>;
  snaps: Record<string, MapSnapshot>;
  bp: Breakpoint;
  openTicket: (mapId: string, ticketId: string) => void;
  openChat: (sessionId: string, ticketId?: string, mapId?: string) => void;
  openDecisions: (focus?: string) => void;
  openQuestion: (questionId: string) => void;
  toMap: () => void;
}) {
  const { brief, bp } = props;
  if (!brief.shown) return null;
  return (
    <BriefingDialog
      briefing={brief.briefing}
      line={brief.line}
      snaps={props.snaps}
      bp={bp}
      onClose={brief.dismiss}
      onTicket={(mapId, ticketId) => {
        brief.dismiss();
        props.openTicket(mapId, ticketId);
      }}
      onAnswer={(q: PendingQuestion) => {
        brief.dismiss();
        props.openQuestion(q.id);
      }}
      onSession={(s: SessionInfo) => {
        brief.dismiss();
        props.openChat(s.id, s.ticketId, s.mapId);
      }}
      onDecision={(id) => {
        brief.dismiss();
        props.openDecisions(id);
      }}
      onResume={() => {
        brief.dismiss();
        props.toMap();
      }}
    />
  );
}
