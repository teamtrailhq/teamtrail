import { BRAND } from '@teamtrail/core';

/** What sign-in protects against, and what it can't. */
export function SignInNotes() {
  return (
    <div className="ra-notes">
      <p className="t-meta ra-note">
        <b>What it stops.</b> A program on this machine, or a device on your network, that isn’t a paired browser: an
        agent with <code>curl</code> can’t approve its own work, answer its own questions or change your settings
        through the Lookout. A device paired here can read, answer and approve, but never change what runs on this
        machine or whom it trusts.
      </p>
      <p className="t-meta ra-note">
        <b>What it can’t stop.</b> A program that can read {BRAND.name}’s config folder can make a pairing code, and one
        that can read your browser’s cookies can use your session. Keep agents out of both:{' '}
        <code>{BRAND.slug} connect</code> sets that up for the agents it registers.
      </p>
    </div>
  );
}
