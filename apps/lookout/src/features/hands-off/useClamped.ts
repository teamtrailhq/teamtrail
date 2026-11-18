import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Whether the element's text is cut by its line clamp (its content is taller than its box), checked again whenever
 * its size changes, so "Read more" shows only when there is more to read.
 */
export function useClamped<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(check);
    watch.observe(el);
    return () => watch.disconnect();
  }, [text]);
  return { ref, clamped };
}
