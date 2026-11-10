import type { SlackWrongTry } from '@teamtrail/connector-slack';

/**
 * Slack accounts that typed a wrong code. While the code waits it is a note; once too many wrong tries dropped it,
 * the trail lead learns who made them.
 */
export function WrongTries({ tries, dropped }: { tries: SlackWrongTry[]; dropped?: boolean }) {
  const who = tries.map((t) => `${t.name ? `@${t.name}` : t.id} (${t.count})`).join(', ');
  if (dropped)
    return (
      <div className="test-line warn">
        Your last code was dropped after too many wrong tries, from {who}. If that wasn't you, someone in the workspace
        is guessing. Get a new code.
      </div>
    );
  return <div className="test-line warn">Wrong code typed in Slack by {who}</div>;
}
