import { useState } from 'react';
import { Button } from '../../components/ui';

export function ChannelTarget(props: { value: string; onSave: (id: string) => void }) {
  const [v, setV] = useState(props.value === 'dm' ? '' : props.value);
  const valid = /^[CG][A-Z0-9]{6,}$/.test(v.trim());
  return (
    <form
      className="sl-field"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) props.onSave(v.trim());
      }}
    >
      <input
        value={v}
        spellCheck={false}
        placeholder="Channel ID, e.g. C0123ABCD"
        aria-label="Channel ID"
        onChange={(e) => setV(e.target.value)}
      />
      <Button type="submit" disabled={!valid || v.trim() === props.value}>
        Save
      </Button>
    </form>
  );
}
