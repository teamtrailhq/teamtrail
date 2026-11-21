import type { MapSnapshot } from '@teamtrail/core';
import { LabelLine } from '../../components/ui';
import { usePrSync } from '../../hooks';
import type { ProofStatuses } from '../map';
import { footerText } from './footerText';
import { useAutoMerge } from './useAutoMerge';

/**
 * The end of the home: what finished today, and the setting behind it: the server's auto-merge setting when it
 * merges verified pull requests itself, else Proof on pull requests.
 */
export function HomeFooter(props: { snap: MapSnapshot; proofs?: ProofStatuses; now: number; onSettings: () => void }) {
  const version = props.snap.tickets.reduce((n, t) => Math.max(n, t.updatedAt), props.snap.map.updatedAt);
  const auto = useAutoMerge(props.snap.map.id, version);
  const text = footerText({ ...props, prs: usePrSync(), autoMerged: auto?.on ? auto.merged : undefined });
  return (
    <footer className="home-footer">
      <LabelLine parts={text} />
      {auto?.on && auto.settings ? (
        <a className="link" href={auto.settings}>
          Auto-merge settings
        </a>
      ) : (
        <button type="button" className="link" onClick={props.onSettings}>
          Proof on pull requests
        </button>
      )}
    </footer>
  );
}
