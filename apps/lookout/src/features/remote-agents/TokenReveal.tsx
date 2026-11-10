import { BRAND } from '@teamtrail/core';
import { useState } from 'react';
import { Button, Label } from '../../components/ui';
import { connectCommand, ENDPOINT_PLACEHOLDER, START_COMMAND, type RemoteClient } from './connectCommands';
import { CopyField } from './CopyField';
import type { CreatedToken } from './useRemoteAgents';

const CLIENTS: { id: RemoteClient; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
];

/**
 * A new token, shown once, and how to connect the agent with it. The command never contains the token, and is
 * only built for a server meant for other machines (`endpoint`): never for the Lookout's own port.
 */
export function TokenReveal(props: { created: CreatedToken; endpoint?: string; onDone: () => void }) {
  const [client, setClient] = useState<RemoteClient>('claude');
  return (
    <div className="ra-reveal" role="status">
      <p className="ra-reveal-title t-row-title">Token for {props.created.name}</p>
      <p className="t-body ra-note">Copy it now. {BRAND.name} keeps only a fingerprint, so it can't show it again.</p>
      <CopyField label="Token" value={props.created.token} copyLabel="Copy token" />
      {!props.endpoint && (
        <>
          <div className="ra-reveal-head">
            <Label>Start the server for remote agents</Label>
          </div>
          <CopyField label="Start command" value={START_COMMAND} copyLabel="Copy command" />
        </>
      )}
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
        value={connectCommand(client, props.endpoint ?? ENDPOINT_PLACEHOLDER)}
        copyLabel="Copy command"
      />
      <p className="t-meta ra-note">
        The first line waits for the token: paste it and press Enter. It isn't shown, and it stays out of your shell
        history.{' '}
        {props.endpoint
          ? 'From another machine, use the address that machine reaches this one by.'
          : `Put the address the server prints in place of ${ENDPOINT_PLACEHOLDER}.`}
        {client === 'codex' && ` Start Codex from the same shell: it reads $${BRAND.tokenEnv} each time.`}
      </p>
      <span>
        <Button variant="primary" size="sm" onClick={props.onDone}>
          I've copied it
        </Button>
      </span>
    </div>
  );
}
