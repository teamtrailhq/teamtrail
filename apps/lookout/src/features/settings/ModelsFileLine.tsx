import { BRAND, type ModelsView } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';

/** The project's models.json (or how to add one), its errors, and who is connected now with what tier. */
export function ModelsFileLine({ view }: { view?: ModelsView | null }) {
  if (!view) return null;
  const file = `${BRAND.dataDir}/${view.file}`;
  const extra = Object.keys(view.models).length;
  const connected = view.agents.map((a) => `${a.agent} ${a.tier}`).join(', ');
  return (
    <>
      <MetaLine
        className="set-hint"
        parts={[
          { text: file, code: true },
          view.exists ? `${extra} of your own models` : 'add new or custom models here',
          'unknown models count as balanced',
        ]}
      />
      {connected && <MetaLine className="set-hint models-connected" parts={[`Connected now: ${connected}`]} />}
      {view.errors.length > 0 && (
        <>
          <div className="sync-line alert">
            <span className="dot" />
            <span>{file} has errors, so only the built-in models count until it is fixed.</span>
          </div>
          <ul className="vf-errors">
            {view.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
