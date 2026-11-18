import type { ReactNode } from 'react';
import { Markdown } from '../../components/ui';

/** A field's Preview: its markdown as the Lookout shows it, or what the field gave instead. */
export function DocPreview({ text, preview }: { text: string; preview?: ReactNode }) {
  if (!text.trim()) return <p className="doc-preview t-meta">Nothing to preview yet.</p>;
  return <div className="doc-preview">{preview ?? <Markdown text={text} />}</div>;
}
