import { Fact } from '../../components/ui';
import { TicketGuideNames } from '../guides';
import { KnowledgePreview } from '../knowledge';
import { VerificationSummary } from '../verification';
import type { TicketView } from './useTicketView';

/** The How section as it reads: guides, checks and level, and the knowledge an agent gets on an open ticket. */
export function HowFacts({ v }: { v: TicketView }) {
  return (
    <dl className="facts">
      <Fact label="Guides">
        <TicketGuideNames map={v.snap.map} ticket={v.t} />
      </Fact>
      {v.verification && (
        <Fact label="Checks">
          <VerificationSummary data={v.verification} />
        </Fact>
      )}
      <KnowledgePreview snap={v.snap} t={v.t} />
    </dl>
  );
}
