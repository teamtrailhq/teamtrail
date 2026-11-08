import { MetaLine, Row } from '../../components/ui';
import { useModels } from './useModels';

/** In the ticket inspector: a ready ticket that waits for a stronger model than any connected agent runs. */
export function ModelWaitNote({ mapId, ticketId }: { mapId: string; ticketId: string }) {
  const view = useModels();
  const wait = view?.waiting.find((w) => w.mapId === mapId && w.ticketId === ticketId);
  if (!wait) return null;
  return (
    <Row
      className="model-wait d-section"
      edge="attention"
      title={`Needs a ${wait.tier} model`}
      context={<MetaLine parts={[`Connected agents run ${wait.best} at most`]} />}
      detail={`Connect an agent on a ${wait.tier} model, or have one claim ${wait.ticketKey} by key.`}
    />
  );
}
