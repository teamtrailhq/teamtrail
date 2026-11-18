import { useState } from 'react';
import { readTextFile } from '../../lib/readTextFile';

/** A file read and waiting for the person to say whether it replaces the field's text or goes after it. */
export interface PendingFile {
  name: string;
  text: string;
}

const n = (x: number) => x.toLocaleString('en-US');

/**
 * Load from file for one field: a file read in the browser goes straight in when the field is empty; otherwise it
 * waits (`pending`) for Replace or Append. `message` says why a file didn't go in.
 */
export function useLoadFile(o: { value: string; onChange: (v: string) => void; max: number; label: string }) {
  const [pending, setPending] = useState<PendingFile>();
  const [message, setMessage] = useState<string>();
  const load = async (file: File | undefined) => {
    if (!file) return;
    setMessage(undefined);
    const read = await readTextFile(file, o.max);
    if (read.kind === 'refused') return setMessage(read.reason);
    if (o.value.trim()) return setPending({ name: read.name, text: read.text });
    o.onChange(read.text);
  };
  const replace = () => {
    if (pending) o.onChange(pending.text);
    setPending(undefined);
  };
  const append = () => {
    if (!pending) return;
    const joined = `${o.value.trimEnd()}\n\n${pending.text}`;
    setPending(undefined);
    if (joined.length > o.max)
      return setMessage(
        `${o.label} with ${pending.name} would be ${n(joined.length)} characters, at most ${n(o.max)}.`,
      );
    o.onChange(joined);
  };
  return { load, pending, replace, append, cancel: () => setPending(undefined), message };
}
