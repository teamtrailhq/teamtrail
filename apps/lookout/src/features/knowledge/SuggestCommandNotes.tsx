import { useState } from 'react';
import { Button } from '../../components/ui';
import { useThisMachine } from '../settings/useThisMachine';
import { useKnowledge, type CommandNotesResult } from './knowledgeContext';

/** What a suggestion run did, in one line: how many notes now wait for review, else that nothing changed. */
function saidOf(r: CommandNotesResult): string {
  const fresh = r.added.length + r.updated.length;
  if (!fresh) return 'Nothing new to review';
  return `${fresh} ${fresh === 1 ? 'note' : 'notes'} to review`;
}

/**
 * Suggest build and test notes: Teamtrail reads this checkout (its manifests, lockfiles, scripts and the approved
 * checks) and writes one suggested note per package, which reaches agents only once confirmed here. It reads this
 * machine's files, so it is offered on this machine only (the route refuses others too).
 */
export function SuggestCommandNotes() {
  const k = useKnowledge();
  const local = useThisMachine();
  const [said, setSaid] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (!local) return null;
  const run = async () => {
    setBusy(true);
    const r = await k.suggestCommands();
    setBusy(false);
    setSaid(typeof r === 'string' ? r : saidOf(r));
  };
  return (
    <span className="kn-commands">
      {said && (
        <span className="t-meta" role="status">
          {said}
        </span>
      )}
      <Button
        size="sm"
        disabled={busy}
        data-tip="Read this repo's manifests, scripts and approved checks, and suggest one note per package on how to install, build, test and run it. Agents get a note with their claims once you confirm it."
        onClick={() => void run()}
      >
        Suggest build and test notes
      </Button>
    </span>
  );
}
