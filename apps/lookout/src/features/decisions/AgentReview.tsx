import type { AuditDecision, MapSnapshot } from '@teamtrail/core';
import { useState } from 'react';
import { Button, LabelLine } from '../../components/ui';
import type { LookoutApi } from '../../hooks';
import { DecisionRow } from './DecisionRow';
import { keptKey } from './keptKey';
import { OverruleForm } from './OverruleForm';

/** How many wait on screen before Show all. */
const SHOWN = 5;

/**
 * "Agents decided · N to review", leading the Logbook: each call an agent made itself within the risk policy, with
 * Keep (remembered in this browser, as the Hands-off home does) and Overrule… (your decision replacing it).
 */
export function AgentReview(props: {
  rows: AuditDecision[];
  current?: AuditDecision;
  snaps: Record<string, MapSnapshot>;
  showTrail: boolean;
  onSelect: (id: string) => void;
  onKeep: (d: AuditDecision) => void;
  onSupersede: LookoutApi['actions']['supersede'];
}) {
  const [overruling, setOverruling] = useState<string>();
  const [all, setAll] = useState(false);
  if (!props.rows.length) return null;
  const shown = all ? props.rows : props.rows.slice(0, SHOWN);
  const more = props.rows.length - shown.length;
  return (
    <section className="dv-review" aria-label="Agents decided, to review">
      <LabelLine as="h3" className="dv-sec-label" parts={['Agents decided', `${props.rows.length} to review`]} />
      <ol className="dv-list">
        {shown.map((d) => {
          const key = keptKey(d);
          const open = overruling === key;
          return (
            <DecisionRow
              key={key}
              d={d}
              newDay={false}
              trail={props.snaps[d.mapId]?.map.key}
              on={props.current?.id === d.id && props.current.mapId === d.mapId}
              showTrail={props.showTrail}
              className="review"
              onClick={() => props.onSelect(d.id)}
              action={
                <span className="dv-review-acts">
                  <Button size="sm" onClick={() => props.onKeep(d)}>
                    Keep
                  </Button>
                  {!d.postedBy && (
                    <Button size="sm" aria-expanded={open} onClick={() => setOverruling(open ? undefined : key)}>
                      Overrule…
                    </Button>
                  )}
                </span>
              }
              below={
                open && (
                  <OverruleForm
                    d={d}
                    onCancel={() => setOverruling(undefined)}
                    onOverrule={(input) => {
                      props.onSupersede(d, input);
                      setOverruling(undefined);
                    }}
                  />
                )
              }
            />
          );
        })}
      </ol>
      {more > 0 && (
        <Button size="sm" variant="ghost" className="dv-more" onClick={() => setAll(true)}>
          Show {more} more
        </Button>
      )}
    </section>
  );
}
