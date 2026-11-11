import type { GuideDoc, GuideFinding } from '@teamtrail/core';
import { argvText } from './guideLabels';
import { LintFindings } from './LintFindings';

/**
 * A guide in full, before it's added or approved: what the lint found, the checklist, every command it proposes as
 * its argv, and the whole instruction text the agent would read.
 */
export function CatalogPreviewBody(props: { p: { findings: GuideFinding[]; guide?: GuideDoc; text?: string } }) {
  const { p } = props;
  const checks = Object.entries(p.guide?.proposedChecks ?? {});
  return (
    <>
      <span className="t-label">Lint</span>
      <LintFindings findings={p.findings} />
      {p.guide && p.guide.checklist.length > 0 && <span className="t-label">Checklist</span>}
      {p.guide && (
        <ul className="catalog-checklist t-body">
          {p.guide.checklist.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {checks.length > 0 && <span className="t-label">Commands it proposes</span>}
      {checks.map(([name, spec]) => (
        <code key={name} className="t-code guide-check">
          {name}: {argvText(spec.run)}
          {spec.cwd && ` (in ${spec.cwd})`}
        </code>
      ))}
      <span className="t-label">Instructions</span>
      <pre className="guide-preview">{p.guide?.instructions ?? p.text}</pre>
    </>
  );
}
