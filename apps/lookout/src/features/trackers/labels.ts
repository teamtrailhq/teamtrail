import type { CredentialSource, RemoteKind } from '@teamtrail/core';

export const SOURCE: Record<CredentialSource, string> = {
  stored: 'Saved token',
  gh: 'gh CLI',
  GITHUB_TOKEN: '$GITHUB_TOKEN',
  GH_TOKEN: '$GH_TOKEN',
  'signed-in': 'Signed in with GitHub',
  LINEAR_API_KEY: '$LINEAR_API_KEY',
};

export const isRemote = (k: string): k is RemoteKind => k === 'github' || k === 'linear';
