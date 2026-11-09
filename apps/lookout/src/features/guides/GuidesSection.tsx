import { BRAND } from '@teamtrail/core';
import { useEffect, useRef, useState } from 'react';
import { Button, MetaLine } from '../../components/ui';
import { SettingsSection } from '../settings/SettingsSection';
import { CatalogDialog } from './CatalogDialog';
import { isHandWritten } from './guideLabels';
import { GuideRow } from './GuideRow';
import { useGuides } from './useGuides';
import { WriteYourOwn } from './WriteYourOwn';

type Act = (path: string, body: Record<string, string>) => void;

/**
 * Settings → Guides: the built-in guides and those added from a catalog, then the ones your team wrote (Write your
 * own), each with its status against the lockfile, the checks it proposes, and the trail lead's actions. A refusal
 * shows under the list it came from. `focus` scrolls here (from the attention queue).
 */
export function GuidesSection(props: { focus?: boolean }) {
  const { view, act } = useGuides();
  const [error, setError] = useState<{ own: boolean; message: string }>();
  const [busy, setBusy] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.focus && view) ref.current?.scrollIntoView({ block: 'start' });
  }, [props.focus, !!view]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!view) return null;
  const actFrom =
    (own: boolean): Act =>
    (path, body) => {
      setBusy(true);
      void act(path, body).then((message) => {
        setError(message ? { own, message } : undefined);
        setBusy(false);
      });
    };
  const errorOf = (own: boolean) => (error && error.own === own ? error.message : undefined);
  return (
    <div className="guides-section" ref={ref}>
      <SettingsSection title="Guides">
        <p className="vf-intro">
          Guides give an agent instructions and a checklist for the tickets that ask for them. A guide can add checks,
          never remove them, and its commands only run once you approve them.
        </p>
        <ul className="guides-list">
          {view.guides
            .filter((r) => !isHandWritten(r))
            .map((r) => (
              <GuideRow key={r.id} r={r} busy={busy} onAct={actFrom(false)} />
            ))}
        </ul>
        <div className="guides-foot">
          <Button size="sm" onClick={() => setBrowsing(true)}>
            Browse guides
          </Button>
          <MetaLine
            parts={[
              { text: `${BRAND.dataDir}/guides/`, code: true },
              { text: 'guides.lock.json', code: true },
            ]}
          />
        </div>
        {view.configErrors.length > 0 && (
          <ul className="vf-errors">
            {view.configErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {errorOf(false) && <span className="vf-err">{errorOf(false)}</span>}
      </SettingsSection>
      <WriteYourOwn
        guides={view.guides.filter(isHandWritten)}
        busy={busy}
        onAct={actFrom(true)}
        error={errorOf(true)}
      />
      {browsing && <CatalogDialog registries={view.registries} onClose={() => setBrowsing(false)} />}
    </div>
  );
}
