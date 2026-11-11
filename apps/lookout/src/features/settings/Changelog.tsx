import { BRAND } from '@teamtrail/core';
import { MetaLine, Wordmark } from '../../components/ui';
import { NEXT, RELEASES } from './releases';
import { SettingsSection } from './SettingsSection';

export function Changelog() {
  return (
    <div className="changelog">
      <div className="about">
        <Wordmark className="about-name" />
        <span className="mono-label">{BRAND.category}</span>
        <p className="onb-tagline">{BRAND.tagline}</p>
        <MetaLine parts={[BRAND.assistant.name]} />
      </div>
      <SettingsSection title="Next">
        {NEXT.map((n) => (
          <div key={n.area} className="cl-row">
            <span className="mono-label">{n.area}</span>
            <ul>
              {n.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </SettingsSection>
      {RELEASES.filter((r) => r.items.length > 0).map((r) => (
        <SettingsSection key={r.version} title={`${r.version} · ${r.date}`}>
          <ul>
            {r.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </SettingsSection>
      ))}
    </div>
  );
}
