import { ScoutAvatar } from '@teamtrail/scout-avatar';
import { useEffect, useState } from 'react';

/** `scout`: the element asked for Scout to say it (`data-tip-scout`), drawn as a speech bubble beside him. */
type Tip = { text: string; x: number; y: number; above: boolean; scout: boolean };

const DELAY_MS = 350;

/**
 * One app-styled tooltip for the whole Lookout. Anything with `data-tip` gets it on hover or
 * keyboard focus; existing `title` attributes are moved to `data-tip` on first hover, so the browser's
 * native tooltip never shows on top. Mounted once, near the root.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    let timer = 0;
    let current: Element | null = null;
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const show = (el: Element) => {
      const text = el.getAttribute('data-tip');
      if (!text) return;
      const r = el.getBoundingClientRect();
      const above = r.bottom + 60 > window.innerHeight;
      setTip({
        text,
        x: r.left + r.width / 2,
        y: above ? r.top - 8 : r.bottom + 8,
        above,
        scout: el.hasAttribute('data-tip-scout'),
      });
    };
    const target = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip], [title]');
      // In the map's SVG only an explicit data-tip counts: its <title> elements stay native.
      if (!el || (el instanceof SVGElement && !el.hasAttribute('data-tip'))) return null;
      const title = el.getAttribute('title');
      if (title) {
        el.setAttribute('data-tip', title);
        el.removeAttribute('title');
      }
      return el;
    };
    const enter = (e: Event) => {
      if ((e as PointerEvent).pointerType === 'touch') return;
      const el = target(e);
      if (el === current) return;
      hide();
      if (!el) return;
      current = el;
      timer = window.setTimeout(() => current === el && show(el), e.type === 'focusin' ? 0 : DELAY_MS);
    };
    const leave = (e: Event) => {
      if (current && !current.contains((e as PointerEvent).relatedTarget as Node | null)) hide();
    };
    document.addEventListener('pointerover', enter);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusin', enter);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('keydown', hide);
    return () => {
      hide();
      document.removeEventListener('pointerover', enter);
      document.removeEventListener('pointerout', leave);
      document.removeEventListener('focusin', enter);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('keydown', hide);
    };
  }, []);
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 140), window.innerWidth - 140);
  if (tip.scout) {
    const x = Math.min(Math.max(tip.x - 24, 8), window.innerWidth - 340);
    return (
      <div
        className={`scout-tip ${tip.above ? 'above' : ''}`}
        role="tooltip"
        style={{ left: x, top: tip.y, transform: tip.above ? 'translateY(-100%)' : undefined }}
      >
        <ScoutAvatar size={1} framed={false} speaking={tip.text} className="scout-tip-face" />
        <p className="scout-tip-bubble">{tip.text}</p>
      </div>
    );
  }
  return (
    <div
      className={`tooltip ${tip.above ? 'above' : ''}`}
      role="tooltip"
      style={{ left, top: tip.y, transform: `translate(-50%, ${tip.above ? '-100%' : '0'})` }}
    >
      {tip.text}
    </div>
  );
}
