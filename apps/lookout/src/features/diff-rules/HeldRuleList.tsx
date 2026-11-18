import type { HeldRules } from '@teamtrail/core';
import { useState } from 'react';
import { Button, MetaLine, Row } from '../../components/ui';
import { WaiveRuleForm } from './WaiveRuleForm';

/**
 * The questions a held completion still has to answer: each rule's question, why it exists and the files that
 * triggered it, with Go without.
 */
export function HeldRuleList(props: { mapId: string; ticketId: string; held: HeldRules; onWaived: () => void }) {
  const [waiving, setWaiving] = useState<string>();
  return (
    <div className="dr-held">
      <p className="t-meta">{props.held.agent}&apos;s completion waits for these answers.</p>
      <ul className="dr-list">
        {props.held.rules.map((r) => (
          <Row
            as="li"
            key={r.id}
            edge="attention"
            title={r.ask}
            context={<MetaLine parts={[{ text: r.id, code: true }, `Why: ${r.why}`]} />}
            detail={r.files.join(', ')}
            actions={
              <Button size="sm" onClick={() => setWaiving(r.id)}>
                Go without
              </Button>
            }
            below={
              waiving === r.id && (
                <WaiveRuleForm
                  mapId={props.mapId}
                  ticketId={props.ticketId}
                  rule={r.id}
                  onDone={() => {
                    setWaiving(undefined);
                    props.onWaived();
                  }}
                />
              )
            }
          />
        ))}
      </ul>
    </div>
  );
}
