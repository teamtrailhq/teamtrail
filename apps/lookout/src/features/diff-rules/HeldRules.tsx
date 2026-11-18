import { useState } from 'react';
import { Button, DetailSection, MetaLine, Row } from '../../components/ui';
import { useHeldRules } from './useHeldRules';
import { WaiveRuleForm } from './WaiveRuleForm';

/**
 * The diff rules a ticket's latest completion was refused for: each question the agent still has to answer, why the
 * rule exists and the files that triggered it. The agent answers and completes again; Go without lets the ticket
 * complete without that answer. Shown only while a completion is held.
 */
export function HeldRules(props: { mapId: string; ticketId: string }) {
  const { held, reload } = useHeldRules(props.mapId, props.ticketId);
  const [waiving, setWaiving] = useState<string>();
  if (!held?.rules.length) return null;
  return (
    <DetailSection label="Diff rules" className="dr-held">
      <p className="t-meta">{held.agent}&apos;s completion waits for these answers.</p>
      <ul className="dr-list">
        {held.rules.map((r) => (
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
                    reload();
                  }}
                />
              )
            }
          />
        ))}
      </ul>
    </DetailSection>
  );
}
