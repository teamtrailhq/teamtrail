import { useLayoutEffect, type RefObject } from 'react';

/**
 * A textarea as tall as its text, up to its CSS max-height, where it starts to scroll. Measured again whenever the
 * text changes, or the field is shown again (Preview back to Write).
 */
export function useAutoResize(ref: RefObject<HTMLTextAreaElement | null>, value: string, shown: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !shown) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [ref, value, shown]);
}
