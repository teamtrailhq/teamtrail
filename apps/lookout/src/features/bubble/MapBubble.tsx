import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../../lib';
import type { AnchorRect } from '../map';
import { bubblePlace } from './bubblePlace';

/**
 * The bubble a ticket (or `main`) opens, beside it inside the map, on the side with room; on a phone, a sheet under
 * the map (`docked`). It closes with ×, Esc, or a click on the empty map (the map's own click). Red on its edge when it
 * needs you.
 */
export function MapBubble(props: {
  anchor?: AnchorRect;
  box: { w: number; h: number };
  docked?: boolean;
  urgent?: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || props.docked) return;
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.docked]);
  const { onClose } = props;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const place = bubblePlace({ anchor: props.anchor, box: props.box, bubble: size });
  const style = props.docked ? undefined : { left: place.left, top: place.top, maxHeight: props.box.h - 16 };
  return (
    <section
      ref={ref}
      className={cx('bubble', props.docked && 'docked', `side-${place.side}`, props.urgent && 'urgent')}
      style={style}
      aria-label={props.label}
    >
      <button type="button" className="bubble-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      {props.children}
    </section>
  );
}
