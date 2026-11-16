import type { MapSnapshot } from '@teamtrail/core';
import { useState } from 'react';
import {
  BriefDialog,
  BriefInboxCard,
  BriefReadyDialog,
  DiscoveryBanner,
  useBrief,
  useBriefReady,
} from '../features/discovery';
import { useShown } from '../hooks/useShown';

/**
 * The discovery step's UI pieces for the current trail: map banner, Communication card (until the queue loads), the
 * "research is done" dialog once per submitted brief, and the review dialog.
 */
export function useDiscoveryUi(snap?: MapSnapshot) {
  const d = useBrief(snap);
  const [open, setOpen] = useState(false);
  const review = () => setOpen(true);
  const b = d.brief;
  const ready = useBriefReady(b);
  // Accept binds to the brief as the dialog opened it; a resubmission meanwhile waits for "Review again".
  const shown = useShown(open ? b?.mapId : undefined, d.hash);
  const s = b?.sections;
  const reviewing = b && open && (
    <BriefDialog
      brief={b}
      error={d.error}
      changed={shown.changed}
      onReviewAgain={shown.reviewAgain}
      onAccept={() => void d.accept(shown.hash).then((ok) => ok && setOpen(false))}
      onRequestChanges={(note) => void d.requestChanges(note).then((ok) => ok && setOpen(false))}
      onClose={() => setOpen(false)}
    />
  );
  const announce = ready.show && !open && (
    <BriefReadyDialog
      onReview={() => {
        ready.close();
        review();
      }}
      onClose={ready.close}
    />
  );
  return {
    /** Opens the review dialog for the current trail's brief. */
    review,
    briefText: s ? [s.existing, s.conventions, s.dataModel, s.api].join('\n') : '',
    banner: b && <DiscoveryBanner brief={b} onReview={review} />,
    /** Only while a brief waits for review: non-null means one does. */
    inboxCard: b?.status === 'submitted' && <BriefInboxCard brief={b} onReview={review} />,
    dialog: (
      <>
        {reviewing}
        {announce}
      </>
    ),
  };
}
