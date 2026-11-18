import type { AttentionItem } from '@teamtrail/core';
import { useState } from 'react';
import { cx } from '../../lib';
import type { NeedRowRender } from './types';

/**
 * Needs you: the attention queue as a compact list, most urgent first, one row open at a time (the first, until the
 * person opens or closes one), `limit` shown and the rest behind "Show N more". The label is red only while
 * something waits; with nothing, Scout says agents keep going.
 */
export function NeedsYou(props: { items: AttentionItem[]; limit: number; row: NeedRowRender }) {
  const { items, limit } = props;
  /** `undefined`: the first row is open; `null`: none. */
  const [opened, setOpened] = useState<string | null>();
  const [all, setAll] = useState(false);
  const openId = opened === undefined ? items[0]?.id : opened;
  const shown = all ? items : items.slice(0, limit);
  const hidden = items.length - limit;
  return (
    <section className="home-section home-needs" aria-labelledby="home-needs">
      <h2 id="home-needs" className={cx('t-label', items.length > 0 && 'urgent')}>
        Needs you · {items.length}
      </h2>
      {items.length === 0 ? (
        <p className="home-clear t-body">
          <b>Nothing needs you.</b> Agents keep going; you'll hear only if something does.
        </p>
      ) : (
        <ul className="home-need-list">
          {shown.map((item) => {
            const open = item.id === openId;
            return props.row(item, open, () => setOpened(open ? null : item.id));
          })}
          {hidden > 0 && (
            <li>
              <button type="button" className="link home-more" onClick={() => setAll(!all)}>
                {all ? 'Show fewer' : `Show ${hidden} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
