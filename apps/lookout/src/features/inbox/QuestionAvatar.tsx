import { ScoutAvatar } from '@teamtrail/scout-avatar';
import { useState } from 'react';

/** Scout beside an open question, 24px (0.6 of the 40px unit): speaks the start of it when it arrives, then waits (alert, still blinking). */
export function QuestionAvatar({ id, text }: { id: string; text: string }) {
  const [spoken, setSpoken] = useState<string>();
  const speaking = spoken !== id;
  return (
    <ScoutAvatar
      size={0.6}
      framed={false}
      state={speaking ? 'speaking' : 'alert'}
      speaking={speaking ? text.slice(0, 60) : undefined}
      onSpeakEnd={() => setSpoken(id)}
      className="q-avatar"
    />
  );
}
