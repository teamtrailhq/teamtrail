import { Disclosure, MetaLine } from '../../components/ui';
import { LEVEL_HELP, LEVEL_TEXT, type TicketVerification } from '../../lib/verification';

const SOURCE = { ticket: 'set on this ticket', trail: 'from the trail', none: 'not set' } as const;

/** Off runs nothing, whatever the config lists; otherwise the checks a completion runs, in order. */
function checksText({ level }: TicketVerification) {
  if (level.level === 'off') return 'Off';
  return level.checks.join(', ') || 'No checks';
}

/** In the inspector's How section: the checks a completion must pass and the level, what the level does behind Details. */
export function VerificationSummary({ data }: { data: TicketVerification }) {
  const { level } = data;
  return (
    <>
      <span className="t-body">{checksText(data)}</span>
      <MetaLine parts={[level.level !== 'off' && LEVEL_TEXT[level.level], SOURCE[level.source]]} />
      <Disclosure>
        <p className="t-meta">{LEVEL_HELP[level.level]}</p>
      </Disclosure>
    </>
  );
}
