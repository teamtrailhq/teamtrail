import { journalFile } from '../history/journalFile';
import { SIGN_IN_JOURNAL, type SignInAction } from '../model/lifecycle';
import type { StoredSignIn } from '../model/signIn';

/** Records a sign-in change in the project's history: the session's id and the browser's name, never a secret. */
export function journalSignIn(root: string, action: SignInAction, session?: StoredSignIn) {
  journalFile(root).append({
    v: 1,
    kind: 'sign-in',
    at: Date.now(),
    mapId: SIGN_IN_JOURNAL,
    action,
    ...(session ? { sessionId: session.id, name: session.name, signIn: session.kind } : {}),
    actor: 'trail lead',
    actorKind: 'trail lead',
  });
}
