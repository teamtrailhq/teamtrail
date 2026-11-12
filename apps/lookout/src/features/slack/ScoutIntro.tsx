import type { SlackStatus } from '@teamtrail/connector-slack';

/** Before connecting: what Scout does, what passes through Teamtrail's Scout service, and an old setup's note. */
export function ScoutIntro({ s, connecting }: { s: SlackStatus; connecting: boolean }) {
  if (connecting) return <p className="sl-lead">Connecting Scout…</p>;
  return (
    <>
      <p className="sl-lead">
        Answer agents, approve finished work and save threads as decisions from Slack. Scout is Teamtrail's Slack app:
        add it to your workspace and it talks to you about this machine's trails. Questions and answers pass through
        Teamtrail's Scout service; your trails, decisions and approvals stay here.
      </p>
      {s.legacy && (
        <p className="sl-lead">
          You made your own Slack app with an earlier version. Scout is now one app, so add it again: your old app's
          tokens are deleted from this machine when you do.
        </p>
      )}
    </>
  );
}
