import type { StoredSignIn } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { openedPageNotice } from '../src/serve/openedPageNotice';

const session: StoredSignIn = {
  id: 'si_3fa9c1d2e4b5',
  name: 'Chrome on macOS',
  hash: 'a'.repeat(64),
  kind: 'machine',
  start: 's',
  instance: 1,
  pairedAt: 1_000,
  lastUsedAt: 1_000,
  expiresAt: 2_000,
  via: 'opened-page',
};

describe('openedPageNotice', () => {
  it('names the time and the short id Settings shows, and how to revoke it, besides the (fakeable) browser name', () => {
    expect(openedPageNotice(session, () => '14:02:07')).toBe(
      '  Signed in a browser (opened page) at 14:02:07: Chrome on macOS · si_3fa9c1. ' +
        'Not you? Revoke it in Settings → Browsers & devices.\n',
    );
  });

  it('says nothing for a pairing the human made with a link or a code', () => {
    expect(openedPageNotice({ ...session, via: undefined })).toBeUndefined();
  });
});
