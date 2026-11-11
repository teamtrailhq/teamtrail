import { BRAND, type SignInView, signInShortId } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { sinceLabel } from '../../lib/sinceLabel';
import { RevokeSignInButton } from './RevokeSignInButton';

const WHERE = { machine: 'This machine', device: 'Another device' };

/** One row per paired browser: where it is, when it paired and was last used, and Revoke (Sign out for this one). */
export function SignInList(props: { sessions: SignInView[]; onRevoke: (id: string) => Promise<string | undefined> }) {
  const now = Date.now();
  return (
    <ul className="ra-list si-list">
      {props.sessions.map((s) => (
        <Row
          key={s.id}
          as="li"
          className="ra-row"
          title={s.current ? `${s.name} · this browser` : s.name}
          titleText={s.name}
          context={
            <MetaLine
              parts={[
                WHERE[s.kind],
                s.via === 'opened-page' ? `From the page ${BRAND.name} opened` : undefined,
                s.via === 'opened-page' ? { text: signInShortId(s.id), code: true } : undefined,
                `Paired ${sinceLabel(s.pairedAt, now)}`,
                `Last used ${sinceLabel(s.lastUsedAt, now)}`,
              ]}
            />
          }
          below={s.current ? undefined : <RevokeSignInButton name={s.name} onRevoke={() => props.onRevoke(s.id)} />}
        />
      ))}
    </ul>
  );
}
