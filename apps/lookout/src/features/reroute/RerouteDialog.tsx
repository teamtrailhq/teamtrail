import type { MapSnapshot } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { Button, Empty, Field, MetaLine, Panel } from '../../components/ui';
import { ago } from '../../lib';
import { RerouteChangeRow } from './RerouteChangeRow';
import { RerouteDestination } from './RerouteDestination';
import { DISMISS_NOTE } from './rerouteText';
import { ticketNamer } from './ticketNamer';
import type { RerouteView } from './types';

/**
 * Review a reroute proposal: why, the evidence, the assumptions it invalidates, every change and the tickets it
 * freezes. Approve applies all of it; reject needs a note the agent gets. Nothing changes until one is clicked.
 */
export function RerouteDialog(props: {
  reroute: RerouteView;
  snap: MapSnapshot;
  error?: string;
  onApprove: (note: string) => void;
  onReject: (note: string) => void;
  onClose: () => void;
}) {
  const { reroute: p, snap } = props;
  const [note, setNote] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props]);
  const short = ticketNamer(snap, p.changes);
  const titles = new Map(snap.tickets.map((t) => [t.id, `${t.key} ${t.title}`]));
  const name = (idOrRef: string) => titles.get(idOrRef) ?? short(idOrRef);
  const assumptions = snap.map.sections.assumptions ?? [];
  const invalidated = p.invalidates.map((id) => assumptions.find((a) => a.id === id) ?? { id, text: '' });
  const pending = p.status === 'pending';
  const challenge = p.kind === 'challenge-destination';
  return (
    <div className="scrim" onClick={props.onClose}>
      <Panel as="div" className="dialog reroute-dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 className="t-heading caps">{challenge ? 'Destination challenged' : 'Reroute proposal'}</h2>
          <MetaLine parts={[{ text: p.id, code: true }, p.status, `by ${p.by}`, `${ago(Date.now() - p.at)} ago`]} />
        </header>
        <div className="reroute-body">
          {challenge && <RerouteDestination reason={p.destinationReason} destination={p.diff?.destination} />}
          <section>
            <h3 className="mono-label">Why</h3>
            <p>{p.reason}</p>
          </section>
          <section>
            <h3 className="mono-label">Evidence</h3>
            <p className="reroute-evidence">{p.evidence}</p>
          </section>
          {invalidated.length > 0 && (
            <section>
              <h3 className="mono-label">Assumptions it invalidates</h3>
              <ul className="item-list">
                {invalidated.map((a) => (
                  <li key={a.id}>
                    <span className="item-text">{a.text}</span>
                    <MetaLine parts={[{ text: a.id, code: true }]} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="mono-label">Changes · {p.changes.length}</h3>
            <ul className="reroute-changes row-list">
              {p.changes.map((c, i) => (
                <RerouteChangeRow key={i} change={c} by={p.by} name={name} />
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mono-label">Closed until you decide</h3>
            {p.wide && (
              <p className="t-meta">
                It touches {p.wide.touched} of {p.wide.open} open tickets, so it freezes none: the current plan stands
                until you decide.
              </p>
            )}
            {p.frozen?.length ? (
              <ul className="item-list">
                {p.frozen.map((id) => (
                  <li key={id} className="item-text">
                    {name(id)}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No tickets closed</Empty>
            )}
          </section>
          {p.note && (
            <section>
              <h3 className="mono-label">Your note</h3>
              <p>{p.note}</p>
            </section>
          )}
        </div>
        {pending && (
          <Field label="Note for the agent (required to reject)">
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
        {props.error && <p className="urgent-text">{props.error}</p>}
        <div className="actions">
          {pending && (
            <>
              <Button
                className="reroute-dismiss"
                variant="ghost"
                data-tip="Reject it without a note of your own"
                onClick={() => props.onReject(DISMISS_NOTE)}
              >
                Dismiss
              </Button>
              <Button className="reroute-reject" disabled={!note.trim()} onClick={() => props.onReject(note.trim())}>
                Reject
              </Button>
              <Button className="reroute-approve" variant="primary" onClick={() => props.onApprove(note.trim())}>
                Approve and apply
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={props.onClose}>
            Close
          </Button>
        </div>
      </Panel>
    </div>
  );
}
