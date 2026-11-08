import { BRAND } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { argvText } from './guideLabels';
import type { CatalogPreview } from './types';
import { useGuides } from './useGuides';

type Step = { kind: 'ready' } | { kind: 'adding' } | { kind: 'added'; pending: string[] };

/**
 * Adding a catalog guide: after the preview, Add copies the file and pins it; then each command the guide proposes is
 * shown as its argv to approve one by one. Nothing runs before it's approved, and a guide that fails the lint can't
 * be added.
 */
export function AddGuideFlow(props: {
  preview: CatalogPreview;
  installed?: string;
  add: (id: string) => Promise<{ pendingChecks: string[] }>;
}) {
  const { preview: p } = props;
  const { act, find } = useGuides();
  const [step, setStep] = useState<Step>({ kind: 'ready' });
  const [error, setError] = useState<string>();
  const id = p.entry.id;
  const add = async () => {
    setError(undefined);
    setStep({ kind: 'adding' });
    try {
      setStep({ kind: 'added', pending: (await props.add(id)).pendingChecks });
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: 'ready' });
    }
  };
  if (p.entry.builtin)
    return <span className="t-meta">Built into {BRAND.name}: already available to every trail, nothing to add.</span>;
  if (step.kind !== 'added') {
    const same = props.installed === p.entry.version;
    const label = props.installed ? 'Update guide' : 'Add guide';
    return (
      <div className="add-guide">
        {!p.ok && <span className="t-meta">The safety lint found errors, so this guide can't be added.</span>}
        <Button variant="primary" disabled={!p.ok || same || step.kind === 'adding'} onClick={() => void add()}>
          {same ? 'Added' : label}
        </Button>
        {error && <span className="vf-err">{error}</span>}
      </div>
    );
  }
  const waiting = find(id)?.pendingChecks ?? step.pending;
  const approve = async (name: string) => setError(await act('/guides/checks/approve', { id, name }));
  return (
    <div className="add-guide">
      <p className="t-body">
        {waiting.length
          ? `Added ${id} ${p.entry.version}. Approve each command it proposes; none runs until you do.`
          : `Added ${id} ${p.entry.version}. Agents get its instructions on tickets that ask for ${id}.`}
      </p>
      {waiting.map((name) => (
        <span key={name} className="guide-check">
          <code className="t-code">
            {name}: {argvText(p.guide?.proposedChecks[name]?.run ?? [])}
          </code>
          <Button size="sm" onClick={() => void approve(name)}>
            Approve check {name}
          </Button>
        </span>
      ))}
      {error && <span className="vf-err">{error}</span>}
    </div>
  );
}
