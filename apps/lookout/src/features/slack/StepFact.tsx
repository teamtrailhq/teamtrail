import type { SlackStatus } from '@teamtrail/connector-slack';

export function StepFact({ s, n }: { s: SlackStatus; n: number }) {
  const fact = stepFact(s, n);
  return fact ? <span className="t-meta">{fact}</span> : null;
}

/** What setup step n already knows: the app (3), the workspace and bot (4), the owner (5). */
function stepFact(s: SlackStatus, n: number) {
  if (n === 3) return s.setup.appId && `app ${s.setup.appId}`;
  if (n === 4) return s.workspace && `${s.workspace.name} · @${s.bot?.name ?? 'scout'}`;
  const owner = s.owners[0];
  if (n === 5 && owner) {
    const via = owner.via === 'git-email' ? ' · git email' : '';
    return `owner ${owner.name ?? owner.id}${via}`;
  }
  if (n === 5 && s.pendingOwner) return 'waiting for you to confirm';
  return undefined;
}
