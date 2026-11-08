import { useState } from 'react';
import { InputRow } from '../../components/ui';

/** Answer an agent's question from the overview; the answer goes to that project's answer files. */
export function AnswerInline(props: { onAnswer: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = (v: string) => {
    if (!v.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    props
      .onAnswer(v.trim())
      .then(
        () => setText(''),
        (e: Error) => setError(e.message),
      )
      .finally(() => setBusy(false));
  };
  return (
    <div className="pj-answer">
      <InputRow
        value={text}
        onValueChange={setText}
        onSubmit={submit}
        action="Answer"
        disabled={busy}
        placeholder="Your answer"
        aria-label="Your answer"
      />
      {error && <span className="vf-err">{error}</span>}
    </div>
  );
}
