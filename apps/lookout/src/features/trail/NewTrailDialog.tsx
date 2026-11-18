import { TRAIL_TEXT_LIMITS, trailTextProblem } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { Panel } from '../../components/ui';
import { assumptionLines } from '../../lib/assumptionLines';
import { summaryLine } from '../../lib/markdown';
import { AssumptionsField } from './AssumptionsField';
import { DocField } from './DocField';
import { NewTrailFooter } from './NewTrailFooter';
import type { TrailSeed } from './trailSeed';

type NewTrailInput = { title: string; destination: string; notes: string; assumptions: string[] };

/**
 * Starts a trail two ways: Create trail charts it here (with its discovery ticket) for any agent to pick up with
 * `/scout resume`, or the `/scout new` command lets Scout frame it in the agent's chat. Teamtrail never runs an agent
 * itself. The destination and notes can be whole markdown documents, typed, pasted or loaded from a file, so the
 * dialog is a large editor (full screen on a phone) whose fields scroll under a footer that stays in view.
 */
export function NewTrailDialog({
  seed,
  onClose,
  tracker,
  onCreate,
}: {
  /** Filled in to start with: the idea of a trail being started over. */
  seed?: TrailSeed;
  onClose: () => void;
  tracker: string;
  onCreate: (input: NewTrailInput) => Promise<{ key: string; id: string }>;
}) {
  const [created, setCreated] = useState<{ key: string; id: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [title, setTitle] = useState(seed?.title ?? '');
  const [dest, setDest] = useState(seed?.destination ?? '');
  const [notes, setNotes] = useState(seed?.notes ?? '');
  const [assumptions, setAssumptions] = useState(seed?.assumptions.join('\n') ?? '');
  const input: NewTrailInput = {
    title: title.trim(),
    destination: dest.trim(),
    notes: notes.trim(),
    assumptions: assumptionLines(assumptions),
  };
  const tooLong = trailTextProblem(input);
  const idea = [input.title, summaryLine(input.destination)].filter(Boolean).join('. ').replace(/"/g, "'");
  // Typed text is never lost to a stray click or Escape: only Close leaves a dialog with something in it.
  const typed = !created && !!(title.trim() || dest.trim() || notes.trim() || assumptions.trim());
  const leave = () => {
    if (!typed) onClose();
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !typed && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, typed]);
  const create = () => {
    setBusy(true);
    setError(undefined);
    onCreate(input)
      .then((m) => setCreated({ key: m.key, id: m.id }))
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="scrim new-trail-scrim" onClick={leave}>
      <Panel as="div" className="dialog new-trail" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 className="t-heading caps">{seed ? 'Start over' : 'New trail'}</h2>
        </header>
        <div className="new-trail-body">
          <div className="new-trail-col">
            <label className="new-trail-title">
              <span className="new-trail-label">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <DocField
              className="doc-destination"
              label="Destination"
              hint="Markdown. Its first sentence is the one-line summary in the header."
              value={dest}
              onChange={setDest}
              max={TRAIL_TEXT_LIMITS.destination}
              placeholder="What is true when this trail is done?"
            />
            <AssumptionsField value={assumptions} onChange={setAssumptions} />
          </div>
          <DocField
            className="doc-notes"
            label="Notes"
            hint="Optional. A spec, a design doc, links: markdown, typed or loaded."
            value={notes}
            onChange={setNotes}
            max={TRAIL_TEXT_LIMITS.notes}
          />
        </div>
        <NewTrailFooter
          idea={idea}
          tracker={tracker}
          created={created}
          error={error}
          disabled={busy || !input.title || !input.destination || !!tooLong}
          onCreate={create}
          onClose={onClose}
        />
      </Panel>
    </div>
  );
}
