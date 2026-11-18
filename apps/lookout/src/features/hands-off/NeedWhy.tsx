import { useState } from 'react';
import { MetaLine, type MetaPart } from '../../components/ui';
import { cx } from '../../lib';
import { useClamped } from './useClamped';

/**
 * Why an open row ranks here: the meta line wrapped inside the card, three lines at most, with Read more when it is
 * cut.
 */
export function NeedWhy({ parts }: { parts: MetaPart[] }) {
  const [more, setMore] = useState(false);
  const text = parts.map((p) => (typeof p === 'string' ? p : p.text)).join(' · ');
  const { ref, clamped } = useClamped<HTMLDivElement>(text);
  if (!parts.length) return null;
  return (
    <div className="home-why">
      <div ref={ref} className={cx('home-why-text', more && 'all')} title={more ? undefined : text}>
        <MetaLine parts={parts} />
      </div>
      {(clamped || more) && (
        <button type="button" className="link home-why-more" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
