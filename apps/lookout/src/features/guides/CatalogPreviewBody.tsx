import { argvText } from './guideLabels';
import { LintFindings } from './LintFindings';
import type { CatalogPreview } from './types';

/** A previewed catalog guide: lint findings, checklist, proposed commands as argv, and the full instructions. */
export function CatalogPreviewBody(props: { p: CatalogPreview }) {
  const { p } = props;
  const checks = Object.entries(p.guide?.proposedChecks ?? {});
  return (
    <>
      <span className="t-label">Safety lint</span>
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
        </code>
      ))}
      <span className="t-label">Instructions</span>
      <pre className="guide-preview">{p.guide?.instructions ?? p.text}</pre>
    </>
  );
}
