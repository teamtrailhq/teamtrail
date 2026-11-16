import { Row } from '../../components/ui';

/** In the ticket inspector: a ticket the discovery gate holds. */
export function DiscoveryHoldNote() {
  return (
    <Row
      className="d-section"
      edge="attention"
      title="Waits on the discovery brief"
      detail="Agents can claim it once you accept the brief."
    />
  );
}
