import type { RemoteKind } from '@teamtrail/core';

/**
 * What the active GitHub or Linear tracker trusts, in plain words: whatever this account writes is you (so agents
 * signed in as you act as you, as they do with local files); people who can write to it can move work; settings
 * they change wait for you; anyone else's text is only text.
 */
export function trustParts(id: RemoteKind): string[] {
  const who = id === 'github' ? 'people with write access' : 'members (not guests)';
  return [
    'Anything this account writes counts as you, including agents signed in as you',
    `${who} can claim, move and close tickets; their decisions show under their name`,
    'settings they change wait for you',
  ];
}
