import { BRAND } from '@teamtrail/core';

/** Shown on Settings when the Lookout is open on another device than the one Teamtrail runs on. */
export function ElsewhereNote() {
  return (
    <p className="sp-elsewhere t-meta" role="note">
      You're looking at this Lookout from another device. You can read, answer and approve from here. What changes what
      runs on the machine {BRAND.name} runs on, or whom it trusts, is set there: the tracker connection, Slack, the risk
      policy, workspaces, guides, remote agents and the projects list.
    </p>
  );
}
