import {
  type AuditDecision,
  type MapSnapshot,
  supersessionChain,
  decisionStatus,
  DECISION_SOURCES,
  webUrl,
} from '@teamtrail/core';
import { useState, useEffect, type FormEvent } from 'react';
import { Pill, Meta, MetaLine, Button, Card, Field, Empty } from '../../components/ui';
import type { LookoutApi } from '../../hooks';
import { stamp, ago, day, hm } from '../../lib';
import { PromoteButton } from '../knowledge';

export function DecisionDetail(props: {
  d: AuditDecision;
  all: AuditDecision[];
  snap?: MapSnapshot;
  onSelect: (id: string) => void;
  onOpenTicket: (mapId: string, ticketId: string) => void;
  onSupersede: LookoutApi['actions']['supersede'];
}) {
  const { d, snap } = props;
  const [form, setForm] = useState(false);
  const [answer, setAnswer] = useState('');
  const [rationale, setRationale] = useState('');
  useEffect(() => {
    setForm(false);
    setAnswer('');
    setRationale('');
  }, [d.id, d.mapId]);
  const chain = supersessionChain(
    props.all.filter((x) => x.mapId === d.mapId),
    d.id,
  );
  const status = decisionStatus(d);
  const ticket = d.ticketId ? snap?.tickets.find((t) => t.id === d.ticketId) : undefined;
  const now = Date.now();
  const link = webUrl(d.source.url);
  return (
    <div className="detail dv-d">
      <div className="d-head">
        <span className="key">{d.id}</span>
        <Pill tone="state" className={`dv-st-${status}`}>
          {status}
        </Pill>
        <MetaLine parts={[stamp(d.decidedAt), `${ago(now - d.decidedAt)} ago`]} />
      </div>
      <h3 className="t-heading">{d.question}</h3>
      <div className="resolution">
        <Meta parts={['Decision']} />
        <p>{d.answer}</p>
      </div>

      <dl className="facts">
        <dt>Trail</dt>
        <dd>{snap ? `${snap.map.key} ${snap.map.title}` : d.mapId}</dd>
        <dt>Ticket</dt>
        <dd>
          {d.ticketId ? (
            <button className="link" onClick={() => props.onOpenTicket(d.mapId, d.ticketId!)}>
              {d.ticketKey} {ticket?.title ?? ''} · open in trail ›
            </button>
          ) : (
            '—'
          )}
        </dd>
        <dt>Decided by</dt>
        <dd>{d.decidedBy}</dd>
        {d.participants.length > 1 && (
          <>
            <dt>Participants</dt>
            <dd>{d.participants.map((p) => p.name ?? p.id).join(', ')}</dd>
          </>
        )}
        <dt>Source</dt>
        <dd>
          {DECISION_SOURCES[d.source.kind].label}
          {link && (
            <>
              {' · '}
              <a href={link} target="_blank" rel="noreferrer">
                {d.source.label ?? 'link'}
              </a>
            </>
          )}
          {!link && d.source.label && ` · ${d.source.label}`}
          {d.source.ref && <span className="ref"> {d.source.ref}</span>}
        </dd>
      </dl>

      {d.alternatives.length > 0 && (
        <div className="dv-sec">
          <h4 className="mono-label">Alternatives</h4>
          <ul className="dv-alts">
            {d.alternatives.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {d.rationale && (
        <div className="dv-sec">
          <h4 className="mono-label">Rationale</h4>
          <p>{d.rationale}</p>
        </div>
      )}

      {chain.length > 1 && (
        <div className="dv-sec">
          <h4 className="mono-label">Supersession</h4>
          <ol className="dv-chain">
            {chain.map((c) => (
              <li key={c.id} className={`${c.id === d.id ? 'cur' : ''} ${c.supersededBy ? 'old' : 'live'}`}>
                <button onClick={() => props.onSelect(c.id)}>
                  <i />
                  <span className="id">{c.id}</span>
                  <span className="a">{c.summary}</span>
                  <MetaLine parts={[c.decidedBy, day(c.decidedAt)]} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="actions">
        <PromoteButton
          draft={() => ({
            title: d.summary || d.question,
            body: [d.answer, d.rationale && `Why: ${d.rationale}`].filter(Boolean).join('\n\n'),
            kind: 'product-decision',
            sources: [`decision:${d.id}`, ...(d.ticketKey ? [`ticket:${d.ticketKey}`] : [])],
          })}
        />
        {status === 'active' && (
          <Button
            on={form}
            onClick={() => setForm((f) => !f)}
            data-tip="Replace this decision with a new answer. Both stay on record"
          >
            Supersede…
          </Button>
        )}
      </div>
      {form && (
        <Card
          as="form"
          tone="inset"
          className="inline-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!answer.trim()) return;
            void props.onSupersede(d, {
              answer: answer.trim(),
              rationale: rationale.trim(),
              alternatives: [d.summary],
            });
            setForm(false);
          }}
        >
          <Field label="New decision">
            <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
          </Field>
          <Field label="Rationale">
            <input value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </Field>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!answer.trim()}>
              Supersede
            </Button>
          </div>
        </Card>
      )}

      <div className="dv-sec">
        <h4 className="mono-label">
          Transcript <span className="n">{d.transcript.length}</span>
        </h4>
        {d.transcript.length ? (
          <div className="dv-transcript comms-log">
            {d.transcript.map((m, i) => (
              <div key={i} className={`msg from-${m.from} voice-${m.from === 'human' ? 'human' : 'agent'}`}>
                <Meta parts={[m.author, hm(m.at)]} />
                <div className="msg-text">{m.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>None recorded</Empty>
        )}
      </div>
    </div>
  );
}
