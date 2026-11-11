import { BRAND, GUIDE_CATALOG_CONTRIBUTING, type InstalledGuide } from '@teamtrail/core';
import { Empty } from '../../components/ui';
import { SettingsSection } from '../settings/SettingsSection';
import { GuideRow } from './GuideRow';

/**
 * Settings → Guides → Write your own: how a team writes its own guide (`teamtrail guides new <id>`, edit, approve
 * here), the guides it wrote with their state (Not approved yet, Approved), and where to share one with everyone.
 */
export function WriteYourOwn(props: {
  guides: InstalledGuide[];
  busy?: boolean;
  onAct: (path: string, body: Record<string, string | boolean>) => void;
  error?: string;
}) {
  return (
    <SettingsSection title="Write your own">
      <p className="vf-intro">
        Write a guide for your team in your repo with <code className="t-code">{BRAND.slug} guides new &lt;id&gt;</code>
        . It starts from a template in <code className="t-code">{BRAND.dataDir}/guides/</code> that passes the lint.
        Fill in the instructions and checklist, then approve it here: agents can only use it once you have, and again
        after every edit.
      </p>
      {props.guides.length > 0 ? (
        <ul className="guides-list own-guides">
          {props.guides.map((r) => (
            <GuideRow key={r.id} r={r} busy={props.busy} onAct={props.onAct} />
          ))}
        </ul>
      ) : (
        <Empty>No guides of your own yet.</Empty>
      )}
      {props.error && <span className="vf-err">{props.error}</span>}
      <p className="t-meta guides-share">
        Useful beyond your team? Check it with <code className="t-code">{BRAND.slug} guides lint</code> and{' '}
        <a href={GUIDE_CATALOG_CONTRIBUTING} target="_blank" rel="noreferrer">
          share it in the public catalog
        </a>
        .
      </p>
    </SettingsSection>
  );
}
