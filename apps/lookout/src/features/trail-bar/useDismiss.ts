import { type RefObject, useEffect } from 'react';

/**
 * A popover's dismissal: while `open`, Esc or a press outside `box` calls `onClose`. Nothing is remembered: closed is
 * where it starts on every load.
 */
export function useDismiss(o: { open: boolean; box: RefObject<HTMLElement | null>; onClose: () => void }) {
  const { open, box, onClose } = o;
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose();
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', key);
    };
  }, [open, box, onClose]);
}
