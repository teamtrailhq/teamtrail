import type { RemoteTokenView } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { RevokeTokenButton } from './RevokeTokenButton';
import { sinceLabel } from './sinceLabel';

/** Settings → Project → Remote agents: one row per token, with when it was made and last used, and Revoke. */
export function RemoteTokenList(props: {
  tokens: RemoteTokenView[];
  onRevoke: (id: string) => Promise<string | undefined>;
}) {
  if (!props.tokens.length) return null;
  const now = Date.now();
  return (
    <ul className="ra-list">
      {props.tokens.map((t) => (
        <Row
          key={t.id}
          as="li"
          className="ra-row"
          title={t.name}
          titleText={t.name}
          context={
            <MetaLine
              parts={[
                `Created ${sinceLabel(t.createdAt, now)}`,
                t.lastUsedAt ? `Last used ${sinceLabel(t.lastUsedAt, now)}` : 'Never used',
              ]}
            />
          }
          below={<RevokeTokenButton name={t.name} onRevoke={() => props.onRevoke(t.id)} />}
        />
      ))}
    </ul>
  );
}
