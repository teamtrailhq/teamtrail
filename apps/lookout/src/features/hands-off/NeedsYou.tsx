import type { AttentionItem } from '@teamtrail/core';
import { useState } from 'react';
import { Button, LabelLine } from '../../components/ui';
import type { NeedRowRender } from './types';

/**
 * Needs you: the attention queue as one panel, most urgent first, one row open at a time (the first, until the person
 * opens or closes one), `limit` shown and the rest behind Show all. The count is rose only while something waits;
 * with nothing, Scout says agents keep going.
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
    <section className="home-section home-panel home-needs" aria-labelledby="home-needs">
      <h2 id="home-needs" className="home-bar">
        <LabelLine parts={['Needs you']} />
        {items.length > 0 ? (
          <span className="home-count urgent">
            <span className="home-count-dot" aria-hidden="true" />
            {items.length} need you
          </span>
        ) : (
          <LabelLine parts={['0']} tone="dim" />
        )}
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
        </ul>
      )}
      {hidden > 0 && (
        <div className="home-panel-foot">
          <LabelLine parts={[all ? `All ${items.length} shown` : `${hidden} more, ranked lower`]} />
          <Button variant="ghost" className="home-more" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : 'Show all'}
          </Button>
        </div>
      )}
    </section>
  );
}
