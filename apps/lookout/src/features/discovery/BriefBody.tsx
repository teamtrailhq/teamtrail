import { BRIEF_SECTION_LABEL, type BriefSections, type DiscoveryBrief } from '@teamtrail/core';
import { Empty, MetaLine } from '../../components/ui';
import { PromoteButton } from '../knowledge';
import { BriefProse } from './BriefProse';

const PROSE: (keyof BriefSections)[] = [
  'summary',
  'productContext',
  'existing',
  'conventions',
  'dataModel',
  'api',
  'risks',
];

/** Every section of a discovery brief, as the trail lead reviews it: the review dialog and the plan to approve. */
export function BriefBody({ brief: b }: { brief: DiscoveryBrief }) {
  const s = b.sections;
  const filled = PROSE.filter((k) => (s[k] as string).trim());
  const empty = PROSE.filter((k) => !(s[k] as string).trim());
  return (
    <div className="brief-body">
      {filled.map((k) => (
        <section key={k}>
          <h3 className="mono-label">{BRIEF_SECTION_LABEL[k]}</h3>
          <BriefProse text={s[k] as string} />
          {(k === 'conventions' || k === 'productContext') && (s[k] as string).trim() && (
            <PromoteButton
              draft={() => ({
                title: `${BRIEF_SECTION_LABEL[k]}: ${(s[k] as string).split('\n')[0].slice(0, 80)}`,
                body: s[k] as string,
                kind: k === 'conventions' ? 'convention' : 'business-rule',
                sources: [`brief:${b.mapId}`],
              })}
            />
          )}
        </section>
      ))}
      <section>
        <h3 className="mono-label">{BRIEF_SECTION_LABEL.assumptions}</h3>
        {s.assumptions.length ? (
          <ul className="item-list">
            {s.assumptions.map((a) => (
              <li key={a.id}>
                <span className="item-text">{a.text}</span>
                <MetaLine parts={[{ text: a.id, code: true }]} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>None listed</Empty>
        )}
      </section>
      <section>
        <h3 className="mono-label">{BRIEF_SECTION_LABEL.openQuestions}</h3>
        {s.openQuestions.length ? (
          <ul className="brief-list">
            {s.openQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        ) : (
          <Empty>None</Empty>
        )}
      </section>
      {empty.length > 0 && (
        <p className="t-meta brief-empty">
          Nothing noted on {empty.map((k) => BRIEF_SECTION_LABEL[k].toLowerCase()).join(', ')}.
        </p>
      )}
      {b.note && (
        <section>
          <h3 className="mono-label">Your last request</h3>
          <p>{b.note}</p>
        </section>
      )}
    </div>
  );
}
