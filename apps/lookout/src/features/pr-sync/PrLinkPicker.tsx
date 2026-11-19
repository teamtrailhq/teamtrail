import { useState } from 'react';
import { Button } from '../../components/ui';
import { prNumberOf, setPrLink } from '../../lib';
import { PrChoiceRow } from './PrChoiceRow';
import { usePrChoices } from './usePrChoices';

/**
 * Link a different pull request: the repo's PRs, the ticket's own first, to pick with one click, or a number or link
 * typed in (checked here for the repo, and by the server with GitHub). A link made by hand stays until it's changed
 * here; the block shows it at once.
 */
export function PrLinkPicker(props: { mapId: string; ticketId: string; linked?: number; onDone: () => void }) {
  const { mapId, ticketId } = props;
  const choices = usePrChoices(mapId, ticketId);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const link = async (pr: number) => {
    setBusy(true);
    setError(undefined);
    const failed = await setPrLink({ mapId, ticketId, pr });
    setBusy(false);
    if (failed) return setError(failed);
    props.onDone();
  };
  const linkTyped = () => {
    if (choices.kind !== 'ready') return;
    const parsed = prNumberOf(typed, choices.repo);
    if (parsed.kind === 'invalid') return setError(parsed.why);
    void link(parsed.pr);
  };
  return (
    <div className="pr-link-picker">
      {choices.kind === 'loading' && <p className="t-meta">Reading pull requests…</p>}
      {choices.kind === 'failed' && <p className="t-meta">{choices.error}</p>}
      {choices.kind === 'ready' && (
        <ul className="pr-choices" aria-label={`Pull requests in ${choices.repo}`}>
          {choices.prs.map((pr) => (
            <PrChoiceRow
              key={pr.number}
              pr={pr}
              linked={pr.number === props.linked}
              busy={busy}
              onPick={() => void link(pr.number)}
            />
          ))}
        </ul>
      )}
      <form
        className="pr-link-typed"
        onSubmit={(e) => {
          e.preventDefault();
          linkTyped();
        }}
      >
        <input
          className="pr-link-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="PR number or link"
          aria-label="Pull request number or link"
          disabled={busy || choices.kind !== 'ready'}
        />
        <Button type="submit" size="sm" variant="primary" disabled={busy || !typed.trim() || choices.kind !== 'ready'}>
          Link
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onDone} disabled={busy}>
          Cancel
        </Button>
      </form>
      {error && (
        <p className="t-meta pr-link-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
