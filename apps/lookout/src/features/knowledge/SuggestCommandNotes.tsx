import { useState } from 'react';
import { Button } from '../../components/ui';
import { useKnowledge } from './knowledgeContext';

/**
 * Suggest how to build and test: Teamtrail reads the repo (its manifests, lockfiles, scripts and the approved checks)
 * and writes one suggested note per package, which reaches agents only once confirmed here. Says what it did.
 */
export function SuggestCommandNotes() {
  const k = useKnowledge();
  const [said, setSaid] = useState<string>();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const r = await k.suggestCommands();
    setBusy(false);
    if (typeof r === 'string') return setSaid(r);
    const fresh = r.added.length + r.updated.length;
    setSaid(fresh ? `${fresh} to review` : 'Nothing new');
  };
  return (
    <span className="kn-commands">
      <Button
        size="sm"
        disabled={busy}
        data-tip="Read this repo's manifests, scripts and approved checks and suggest one note per package on how to install, build, test and run it. Agents get a note once you confirm it."
        onClick={() => void run()}
      >
        Suggest build and test notes
      </Button>
      {said && <span className="t-meta">{said}</span>}
    </span>
  );
}
