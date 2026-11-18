import { Empty, Label, MetaLine, Row } from '../../components/ui';
import { ago } from '../../lib/format';
import { useFlakyChecks } from './useFlakyChecks';

const MODE_NOTE = {
  enforce: 'A pass on retry waits for you.',
  observe: 'A pass on retry goes through, flagged.',
  off: 'The flaky gate is off: passes on retry count.',
};

/**
 * Trail stats → Flaky checks: checks that failed and then passed on the same code within a ticket, with the failing
 * test when the output names one, how often, on which tickets and when last.
 */
export function FlakyChecksSection() {
  const view = useFlakyChecks();
  if (!view) return null;
  const now = Date.now();
  return (
    <section className="perf-section flaky-checks">
      <Label as="h3">Flaky checks</Label>
      <p className="perf-note t-meta">
        Checks that failed, then passed on the same code with no change. {MODE_NOTE[view.mode]}
      </p>
      {view.rows.length ? (
        <ul className="perf-rows">
          {view.rows.map((r) => (
            <Row
              as="li"
              key={`${r.name}\n${r.test ?? ''}`}
              className="perf-row"
              title={r.test ? `${r.name} · ${r.test}` : r.name}
              trailing={<span>{r.count === 1 ? 'once' : `${r.count} times`}</span>}
              context={<MetaLine parts={[r.tickets.join(', '), `last seen ${ago(now - r.lastSeen)} ago`]} />}
            />
          ))}
        </ul>
      ) : (
        <Empty>No flaky checks seen.</Empty>
      )}
    </section>
  );
}
