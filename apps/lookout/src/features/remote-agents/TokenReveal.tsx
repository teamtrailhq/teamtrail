import { BRAND } from '@teamtrail/core';
import { useState } from 'react';
import { Button, Label } from '../../components/ui';
import { connectCommand, type RemoteClient } from './connectCommands';
import { CopyField } from './CopyField';
import type { CreatedToken } from './useRemoteAgents';

const CLIENTS: { id: RemoteClient; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
];

/** A new token, shown once: the token, and the command that connects the agent with it. */
export function TokenReveal(props: { created: CreatedToken; endpoint: string; onDone: () => void }) {
  const [client, setClient] = useState<RemoteClient>('claude');
  return (
    <div className="ra-reveal" role="status">
      <p className="ra-reveal-title t-row-title">Token for {props.created.name}</p>
      <p className="t-body ra-note">Copy it now. {BRAND.name} keeps only a fingerprint, so it can't show it again.</p>
      <CopyField label="Token" value={props.created.token} copyLabel="Copy token" />
      <div className="ra-reveal-head">
        <Label>Run on the agent's machine</Label>
        <span className="ra-clients">
          {CLIENTS.map((c) => (
            <Button
              key={c.id}
              size="sm"
              on={client === c.id}
              aria-pressed={client === c.id}
              onClick={() => setClient(c.id)}
            >
              {c.label}
            </Button>
          ))}
        </span>
      </div>
      <CopyField
        label="Connect command"
        value={connectCommand(client, { url: props.endpoint, token: props.created.token })}
        copyLabel="Copy command"
      />
      <p className="t-meta ra-note">
        To keep the token out of your shell history, put it in <code>${BRAND.tokenEnv}</code> or pipe it with{' '}
        <code>--token-stdin</code>, and leave <code>--token</code> out.
      </p>
      <span>
        <Button variant="primary" size="sm" onClick={props.onDone}>
          I've copied it
        </Button>
      </span>
    </div>
  );
}
