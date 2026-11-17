import { useState } from 'react';
import { Disclosure } from '../../components/ui';
import { useCheckScreening } from '../../hooks/useCheckScreening';
import { apiBase } from '../../lib/apiBase';
import { commandWords } from '../../lib/commandWords';
import { rowFindings } from '../../lib/rowFindings';
import { CheckEditRow } from './CheckEditRow';
import { ChecksAdd } from './ChecksAdd';
import { ChecksSave, type SaveState } from './ChecksSave';
import type { EditedCheck } from './editedCheck';
import type { VerificationConfigView } from './useVerificationConfig';

/** The checks as the file has them, in the order they run. */
function rowsOf(view: VerificationConfigView): EditedCheck[] {
  const c = view.config;
  if (!c) return [];
  return c.run.filter((n) => c.checks[n]).map((n) => ({ name: n, command: c.checks[n].run.join(' ') }));
}

/**
 * Set the checks every completion runs, from here: each a name and a command, kept as words. Saving writes
 * verification.json and approves it in the same step (the server's setChecks.ts checks it all again, only on the
 * machine Teamtrail runs on), so it asks once that you know what they run.
 */
export function ChecksEditor({ view }: { view: VerificationConfigView }) {
  const [rows, setRows] = useState<EditedCheck[]>(() => rowsOf(view));
  const [added, setAdded] = useState(false);
  const [sure, setSure] = useState(false);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const set = (i: number, patch: Partial<EditedCheck>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // read against the repo as they're typed: a command that can't run is said under it, never refused
  const screened = rows.map((r, n) => ({
    name: String(n),
    run: commandWords(r.command),
    cwd: view.config?.checks[r.name]?.cwd,
  }));
  const screening = useCheckScreening(screened);
  const findings = rowFindings({ findings: screening, rows });
  const save = async () => {
    setState({ kind: 'saving' });
    const checks = rows
      .filter((r) => r.name.trim() && r.command.trim())
      .map((r) => ({ name: r.name.trim(), run: commandWords(r.command) }));
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
      {rows.length > 0 && (
        <ul className="vf-edit-list">
          {rows.map((r, i) => (
            <CheckEditRow
              key={i}
              check={r}
              findings={findings[i]}
              focus={added && i === rows.length - 1}
              onChange={(patch) => set(i, patch)}
              onRemove={() => setRows(rows.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}
      <ChecksAdd
        empty={rows.length === 0}
        onAdd={(check) => {
          setAdded(true);
          setRows([...rows, check]);
        }}
      />
      <Disclosure label="How checks run">
        <p className="t-meta">
          Each command runs from the repository&apos;s root as words, never through a shell: no pipes or{' '}
          <code className="t-code">&amp;&amp;</code>, and what it runs must already be in the repo. For example{' '}
          <code className="t-code">npm run e2e</code>, <code className="t-code">make test</code>,{' '}
          <code className="t-code">./scripts/check.sh</code> or <code className="t-code">pytest -q</code>.
        </p>
      </Disclosure>
      <ChecksSave sure={sure} onSure={setSure} state={state} onSave={() => void save()} />
    </div>
  );
}
