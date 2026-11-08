import { type MapSnapshot, type SessionInfo, deriveStates } from '@teamtrail/core';
import { useState, type FormEvent } from 'react';
import { Empty, Button, Card, Field } from '../../components/ui';
import { type LookoutApi } from '../../hooks';
import { TRAIL_LEAD, heldLeases, isRunning } from '../../lib';
import { CriteriaSection } from '../criteria';
import { KnowledgePreview, PromoteButton } from '../knowledge';
import { PrFlagBadges } from '../pr-sync';
import { TicketRole } from '../roles';
import { VerificationPanel } from '../verification';
import { TicketWorkspace } from '../workspaces';
import { LeaseFacts } from './LeaseFacts';
import { OtherComments } from './OtherComments';
import { ResolutionNote } from './ResolutionNote';
import { TicketActions } from './TicketActions';
import { TicketFacts } from './TicketFacts';
import type { Form } from './types';

export function TicketDetail(props: {
  snap: MapSnapshot;
  id: string;
  api: LookoutApi;
  sessions: SessionInfo[];
  form: Form;
  setForm: (f: Form) => void;
  onOpenChat: (id: string) => void;
  onOpenDecision?: (id: string) => void;
}) {
  const { snap, api, form, setForm } = props;
  const { actions } = api;
  const [answer, setAnswer] = useState('');
  const [rationale, setRationale] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [reason, setReason] = useState('Not needed to reach the destination.');
  const t = snap.tickets.find((x) => x.id === props.id);
  if (!t) return <Empty>Ticket not found.</Empty>;
  const state = deriveStates(snap.tickets, snap.map.mode).get(t.id)!;
  const session = props.sessions.find((s) => s.ticketId === t.id && isRunning(s));
  const mine = t.assignee === TRAIL_LEAD;
  const lease = t.state === 'open' ? heldLeases(api.leases, snap.map.id).get(t.id) : undefined;
  const resolution = [...t.comments].reverse().find((c) => /^\*\*(Resolution|Ruled out of scope)\*\*/.test(c.body));
  const others = t.comments.filter((c) => c !== resolution);
  const decisions = api.decisions.filter((d) => d.mapId === snap.map.id && d.ticketId === t.id);

  return (
    <div className="detail">
      <TicketFacts t={t} state={state} tickets={snap.tickets} />

      <PrFlagBadges mapId={snap.map.id} ticketId={t.id} />
      <TicketRole mapId={snap.map.id} ticket={t} />
      <CriteriaSection snap={snap} t={t} />
      <KnowledgePreview snap={snap} t={t} />
      {t.closeReason === 'not_planned' && (
        <PromoteButton
          label="Save as dead end"
          draft={() => ({
            title: `Ruled out: ${t.title}`,
            body: t.comments.at(-1)?.body ?? t.body,
            kind: 'dead-end',
            sources: [`trail:${snap.map.key}`, `ticket:${t.key}`],
          })}
        />
      )}

      {lease && <LeaseFacts lease={lease} onRelease={() => actions.releaseLease(t.id)} />}
      {!lease && <TicketWorkspace mapId={snap.map.id} ticketId={t.id} />}
      <VerificationPanel mapId={snap.map.id} trail={snap.map.verification} ticket={t} state={state} />

      <TicketActions
        t={t}
        state={state}
        session={session}
        mine={mine}
        form={form}
        setForm={setForm}
        actions={actions}
        onOpenChat={props.onOpenChat}
      />

      {form === 'resolve' && (
        <Card
          as="form"
          tone="inset"
          className="inline-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!answer.trim()) return;
            void actions.resolve(t.id, answer.trim(), {
              rationale: rationale.trim(),
              alternatives: alternatives
                .split('\n')
                .map((a) => a.trim())
                .filter(Boolean),
            });
            setForm(null);
            setAnswer('');
            setRationale('');
            setAlternatives('');
          }}
        >
          <Field label="Resolution">
            <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
          </Field>
          <Field label="Rationale">
            <input value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </Field>
          <Field label="Alternatives considered">
            <textarea
              rows={2}
              value={alternatives}
              onChange={(e) => setAlternatives(e.target.value)}
              placeholder="One per line"
            />
          </Field>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!answer.trim()}>
              Resolve
            </Button>
          </div>
        </Card>
      )}
      {form === 'rule' && (
        <Card
          as="form"
          tone="inset"
          className="inline-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void actions.ruleOut({ ticketId: t.id }, reason);
            setForm(null);
          }}
        >
          <Field label="Reason">
            <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Rule out
            </Button>
          </div>
        </Card>
      )}

      {resolution && (
        <ResolutionNote resolution={resolution} decisions={decisions} onOpenDecision={props.onOpenDecision} />
      )}
      <p className="body">{t.body}</p>
      <OtherComments comments={others} />
    </div>
  );
}
