import type { SavedMark } from './slotContext';

const two = (n: number) => String(n).padStart(2, '0');

/** The saved note's parts: `Saved`, `journaled` where the route journals the change, and the local time. */
export function savedParts(saved: SavedMark): string[] {
  const at = new Date(saved.at);
  const time = `${two(at.getHours())}:${two(at.getMinutes())}`;
  return saved.journaled ? ['Saved', 'journaled', time] : ['Saved', time];
}
