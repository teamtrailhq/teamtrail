import { useState } from 'react';
import { Button } from '../../components/ui';
import { useCheckScreening } from '../../hooks/useCheckScreening';
import { apiBase } from '../../lib/apiBase';
import { rowFindings } from '../../lib/rowFindings';
import { CheckFindingList } from '../check-screening';
import type { VerificationConfigView } from './useVerificationConfig';

type Row = { name: string; command: string };

/** Common checks, offered as one click each. */
const SUGGESTED: Row[] = [
  { name: 'test', command: 'npm test' },
  { name: 'lint', command: 'npm run lint' },
  { name: 'typecheck', command: 'npm run typecheck' },
];

/** The checks as the file has them, in the order they run. */
function rowsOf(view: VerificationConfigView): Row[] {
  const c = view.config;
  if (!c) return [];
  return c.run.filter((n) => c.checks[n]).map((n) => ({ name: n, command: c.checks[n].run.join(' ') }));
}

/** A command as words: split on spaces, never handed to a shell. */
const words = (command: string) => command.trim().split(/\s+/).filter(Boolean);

/**
 * Set the checks every completion runs, from here: each a name and a command, kept as words. Saving writes
 * verification.json and approves it in the same step (the server's setChecks.ts checks it all again, only on the
 * machine Teamtrail runs on), so it asks once that you know what they run.
 */
export function ChecksEditor({ view }: { view: VerificationConfigView }) {
  const [rows, setRows] = useState<Row[]>(() => rowsOf(view));
  const [sure, setSure] = useState(false);
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; text: string }>({
    kind: 'idle',
  });
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows(rows.filter((_, j) => j !== i));
  // read against the repo as they're typed: a command that can't run is said next to it, never refused
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const screened = rows.map((r, n) => ({
    name: String(n),
    run: words(r.command),
    cwd: view.config?.checks[r.name]?.cwd,
  }));
  const screening = useCheckScreening(screened);
  const findings = rowFindings({ findings: screening, rows, kept });
  const offered = SUGGESTED.filter((s) => !rows.some((r) => r.name === s.name));
  const save = async () => {
    setState({ kind: 'saving' });
    const checks = rows
      .filter((r) => r.name.trim() && r.command.trim())
      .map((r) => ({ name: r.name.trim(), run: words(r.command) }));
    const res = await fetch(`${apiBase()}/verification/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checks, base: view.approval?.base ?? 'none', acknowledged: true }),
    }).catch(() => undefined);
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (res?.ok) return setState({ kind: 'saved' });
    setState({ kind: 'error', text: body?.error ?? "The server didn't answer." });
  };
  return (
    <div className="vf-editor">
      {rows.map((r, i) => (
        <div key={i} className="vf-edit-check">
          <div className="vf-edit-row">
            <input
              aria-label="Name"
              value={r.name}
              placeholder="name"
              onChange={(e) => set(i, { name: e.target.value })}
            />
            <input
              aria-label="Command"
              className="t-code"
              value={r.command}
              placeholder="npm test"
              onChange={(e) => set(i, { command: e.target.value })}
            />
            <Button size="sm" variant="ghost" onClick={() => remove(i)}>
              Remove
            </Button>
          </div>
          <CheckFindingList
            findings={findings[i]}
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={() => remove(i)}>
                  Remove check
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setKept(new Set([...kept, words(r.command).join(' ')]))}
                >
                  Keep anyway
                </Button>
              </>
            }
          />
        </div>
      ))}
      <div className="vf-edit-add">
        {offered.map((s) => (
          <Button key={s.name} size="sm" variant="ghost" onClick={() => setRows([...rows, s])}>
            + {s.command}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { name: '', command: '' }])}>
          + Another
        </Button>
      </div>
      {rows.some((r) => !SUGGESTED.some((s) => s.name === r.name)) && (
        <p className="vf-edit-hint t-meta">
          Run from the repository&apos;s root, as words (no pipes or <code>&amp;&amp;</code>): the script must already
          be in the repo. For example <code>npm run e2e</code>, <code>make test</code>, <code>./scripts/check.sh</code>{' '}
          or <code>pytest -q</code>.
        </p>
      )}
      <label className="vf-edit-sure">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        <span>I know what these commands run, and approve them</span>
      </label>
      <div className="vf-edit-save">
        <Button size="sm" disabled={!sure || state.kind === 'saving'} onClick={() => void save()}>
          {state.kind === 'saving' ? 'Saving…' : 'Save checks'}
        </Button>
        {state.kind === 'saved' && <span className="t-meta">Saved and approved.</span>}
        {state.kind === 'error' && <span className="vf-err">{state.text}</span>}
      </div>
    </div>
  );
}
