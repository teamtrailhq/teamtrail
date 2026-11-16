import { DEFAULT_GUIDES_BY_TYPE, type InstalledGuide, type TicketType } from '@teamtrail/core';
import { Button, MetaLine } from '../../components/ui';
import { TYPE_TEXT } from '../../lib';

/**
 * One ticket type's guides: a toggle per approved guide, plus any it still has that can't be used now (marked, so it
 * can be taken off). A hint names the default when this type's guides differ from it.
 */
export function TypeGuidesRow(props: {
  type: TicketType;
  ids: string[];
  usable: InstalledGuide[];
  onToggle: (id: string) => void;
}) {
  const { type, ids, usable } = props;
  const stale = ids.filter((id) => !usable.some((r) => r.id === id));
  const def = DEFAULT_GUIDES_BY_TYPE[type] ?? [];
  const differs = def.length !== ids.length || def.some((id) => !ids.includes(id));
  const nameOf = (id: string) => usable.find((r) => r.id === id)?.guide?.name ?? id;
  const hint = differs ? `default ${def.map(nameOf).join(', ') || 'none'}` : undefined;
  return (
    <div className="type-guides-row" data-type={type}>
      <span className="type-name">{TYPE_TEXT[type]}</span>
      <span className="type-toggles">
        {usable.map((r) => {
          const on = ids.includes(r.id);
          return (
            <Button
              key={r.id}
              size="sm"
              on={on}
              aria-pressed={on}
              title={r.guide!.summary}
              data-guide-id={r.id}
              onClick={() => props.onToggle(r.id)}
            >
              {r.guide!.name}
            </Button>
          );
        })}
        {stale.map((id) => (
          <Button
            key={id}
            size="sm"
            on
            aria-pressed
            className="off"
            title={`${id} can't be used now`}
            onClick={() => props.onToggle(id)}
          >
            {id}
          </Button>
        ))}
      </span>
      <MetaLine className="type-hint" parts={[hint]} />
    </div>
  );
}
