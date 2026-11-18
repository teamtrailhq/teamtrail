import { gateModeFor, type GateMode, type GateName } from '@teamtrail/core';
import { useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { SettingsSection } from '../settings/SettingsSection';
import { useThisMachine } from '../settings/useThisMachine';
import { useVerificationConfig } from '../settings/useVerificationConfig';
import { gateLock } from './gateLock';
import { GateRow } from './GateRow';
import { isKnownGate } from './gateText';
import { summarizeGates } from './summarizeGates';
import { useGateLog } from './useGateLog';

/** A choice sent and not yet back in verification.json, shown meanwhile; dropped once the file moves on. */
type Pending = { gate: GateName; mode: GateMode; base: string };

async function putGate(p: Pending): Promise<string | undefined> {
  const res = await fetch(`${apiBase()}/verification/gates`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  }).catch(() => undefined);
  if (res?.ok) return undefined;
  const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
  return body?.error ?? "The server didn't answer.";
}

/**
 * Settings → This trail → Gates: each verification gate off, observing (noting what it would hold) or enforcing
 * (holding work for you), and what it did in the last two weeks. Set on the machine Teamtrail runs on, approved as
 * it's saved; read anywhere else, Cloud included.
 */
export function GatesSection(props: { onOpenTicket: (mapId: string, ticketId: string) => void }) {
  const view = useVerificationConfig();
  const log = useGateLog();
  const local = useThisMachine();
  const [pending, setPending] = useState<Pending>();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const base = view.approval?.base ?? 'none';
  const lock = gateLock({ local, exists: view.exists, valid: !!view.config, waiting: view.approval?.waiting });
  const shown = pending?.base === base ? pending : undefined;
  const modeOf = (gate: string): GateMode => {
    if (!isKnownGate(gate)) return 'off';
    if (shown?.gate === gate) return shown.mode;
    return gateModeFor(view.exists ? view.config : undefined, gate);
  };
  const save = async (gate: string, mode: GateMode) => {
    if (!isKnownGate(gate)) return;
    const next = { gate, mode, base };
    setError(undefined);
    setPending(next);
    const failed = await putGate(next);
    if (!failed) return;
    setPending(undefined);
    setError(failed);
  };
  return (
    <SettingsSection title="Gates">
      <p className="vf-intro">
        Gates catch work that passed its checks but shouldn&apos;t count yet. Observe a gate first to see what it would
        hold, then enforce it: held work waits for you, with a way past it.
      </p>
      <ul className="gate-list">
        {summarizeGates(log?.entries ?? []).map((s) => (
          <GateRow
            key={s.gate}
            summary={s}
            days={log?.days}
            mode={modeOf(s.gate)}
            locked={lock.kind === 'locked'}
            onMode={(m) => void save(s.gate, m)}
            onOpenTicket={props.onOpenTicket}
          />
        ))}
      </ul>
      {lock.kind === 'locked' && lock.reason && <span className="set-hint t-meta">{lock.reason}</span>}
      {log === null && <span className="set-hint t-meta">What the gates did couldn&apos;t be loaded.</span>}
      {error && <span className="vf-err">{error}</span>}
    </SettingsSection>
  );
}
