import { type RefObject, useEffect } from 'react';

/** The class on the page's root that reserves the guide's strip at the bottom (styles/guide.css `--guide-room`). */
export const GUIDE_ROOM_CLASS = 'setup-guide-shown';

/**
 * While the guide shows, the page keeps a strip at the bottom for it, so it never covers what the app lays out.
 * While its bubble is open, a press outside it or Esc folds it to Scout: it is a popover, never left over the page.
 */
export function useGuideRoom(o: {
  shown: boolean;
  open: boolean;
  box: RefObject<HTMLElement | null>;
  fold: () => void;
}) {
  const { shown, open, box, fold } = o;
  useEffect(() => {
    if (!shown) return;
    const root = document.documentElement;
    root.classList.add(GUIDE_ROOM_CLASS);
    return () => root.classList.remove(GUIDE_ROOM_CLASS);
  }, [shown]);
  useEffect(() => {
    if (!shown || !open) return;
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && fold();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && fold();
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', key);
    };
  }, [shown, open, box, fold]);
}
