import { useEffect, useState } from 'react';
import { SavedNote } from '../../components/ui';
import { savedParts } from './savedParts';
import type { SavedMark } from './slotContext';

/** The section's saved note, faded in a frame after each save (keyed by the save by its parent). */
export function SectionSaved({ saved }: { saved: SavedMark }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(f);
  }, []);
  return <SavedNote className="set-saved" shown={on} parts={savedParts(saved)} />;
}
