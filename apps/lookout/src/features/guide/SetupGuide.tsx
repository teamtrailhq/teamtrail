import { ScoutAvatar } from '@teamtrail/scout-avatar';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/ui';
import { useSetupSteps } from './useSetupSteps';

const KEY = 'teamtrail.guide.open';

/** Whether the guide was left open in this browser (a per-viewer convenience; open when unknown). */
function wasOpen() {
  try {
    return localStorage.getItem(KEY) !== 'no';
  } catch {
    return true;
  }
}

function remember(open: boolean) {
  try {
    localStorage.setItem(KEY, open ? 'yes' : 'no');
  } catch {
    // storage blocked: it just opens again next time
  }
}

/**
 * Scout in the corner, with Get started in a speech bubble: the steps that set this workspace up, each ticked from the
 * server's answer, the next one leading. Minimized to Scout and "2 of 5"; gone once every step is done. Only behind a
 * server that says where setup stands (useSetupSteps.ts).
 */
export function SetupGuide() {
  const view = useSetupSteps();
  const [open, setOpen] = useState(wasOpen);
  if (!view || view.complete) return null;
  const toggle = (next: boolean) => {
    setOpen(next);
    remember(next);
  };
  const count = `${view.done} of ${view.total}`;
  // On the page itself, not inside the app's zones: a zone that makes its own stacking or containing box would
  // otherwise pin a fixed corner to itself instead of the window.
  return createPortal(
    <aside className={`setup-guide${open ? ' open' : ''}`} aria-label="Get started">
      {open && (
        <div className="setup-bubble">
          <header>
            <b>Get started</b>
            <span className="t-meta">{count}</span>
            <Button size="sm" variant="ghost" onClick={() => toggle(false)} aria-label="Minimize">
              –
            </Button>
          </header>
          <ol>
            {view.steps.map((s, i) => (
              <li key={s.href + s.title} className={[s.done && 'done', s.next && 'next'].filter(Boolean).join(' ')}>
                <span className="setup-mark" aria-hidden="true">
                  {s.done ? '✓' : i + 1}
                </span>
                <a href={s.href}>{s.title}</a>
                {s.optional && <span className="t-meta">optional</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
      <button type="button" className="setup-scout" onClick={() => toggle(!open)} aria-expanded={open}>
        <ScoutAvatar size={1} framed={false} state="idle" />
        {!open && <span className="setup-chip">Get started · {count}</span>}
      </button>
    </aside>,
    document.body,
  );
}
