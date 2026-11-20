import type { GateMode } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { gateActivityLine } from './gateActivityLine';
import { GateEntries } from './GateEntries';
import { GateModeControl } from './GateModeControl';
import { gateAbout, gateTitle, isKnownGate } from './gateText';
import type { GateSummary } from './types';

/**
 * One gate: what it catches, what it did lately, its mode on the right (Off / Observe / Enforce) and the tickets. A gate this version doesn't
 * know (a newer one wrote the journal) shows by its raw name, with what it did and no control.
 */
export function GateRow(props: {
  summary: GateSummary;
  /** The log's window; undefined while it isn't loaded, and then nothing is said about what the gate did. */
  days?: number;
  mode: GateMode;
  locked: boolean;
  onMode: (mode: GateMode) => void;
  onOpenTicket: (mapId: string, ticketId: string) => void;
}) {
  const { summary: s } = props;
  const title = gateTitle(s.gate);
  const known = isKnownGate(s.gate);
  return (
    <Row
      as="li"
      className="gate-row"
      edge={s.held ? 'attention' : 'neutral'}
      title={known ? title : <span className="t-code">{title}</span>}
      context={<MetaLine parts={[gateAbout(s.gate)]} />}
      detail={props.days ? gateActivityLine(s, props.days) : undefined}
      action={
        known && (
          <GateModeControl
            gate={s.gate}
            label={title}
            value={props.mode}
            disabled={props.locked}
            onChange={props.onMode}
          />
        )
      }
      below={<GateEntries entries={s.entries} onOpenTicket={props.onOpenTicket} />}
    />
  );
}
