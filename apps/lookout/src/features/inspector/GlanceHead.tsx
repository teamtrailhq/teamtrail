import type { MapSnapshot } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { LabelLine, SceneCard } from '../../components/ui';
import { summaryLine } from '../../lib/markdown';

/**
 * The trail at a glance leads with where it is going: the trail's key and title on the label line, the destination's
 * first sentence as the headline (the title when there is none), a way to read it in full, then the phase.
 */
export function GlanceHead(props: { snap: MapSnapshot; onDestination?: () => void; children: ReactNode }) {
  const { map } = props.snap;
  const dest = summaryLine(map.sections.destination);
  return (
    <SceneCard
      className="glance-head"
      label={<LabelLine parts={['Trail', map.key, dest ? map.title : undefined]} />}
      headline={dest || map.title}
      headlineAs="h2"
      help={
        dest &&
        props.onDestination && (
          <>
            Destination ·{' '}
            <button type="button" className="link" onClick={props.onDestination}>
              read in full
            </button>
          </>
        )
      }
    >
      {props.children}
    </SceneCard>
  );
}
