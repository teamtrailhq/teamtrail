import { LintFindings } from './LintFindings';
import { argvText } from './roleLabels';
import type { CatalogPreview } from './types';

/** A previewed catalog role: lint findings, checklist, proposed commands as argv, and the full instructions. */
export function CatalogPreviewBody(props: { p: CatalogPreview }) {
  const { p } = props;
  const checks = Object.entries(p.role?.proposedChecks ?? {});
  return (
    <>
      <span className="t-label">Safety lint</span>
      <LintFindings findings={p.findings} />
      {p.role && p.role.checklist.length > 0 && <span className="t-label">Checklist</span>}
      {p.role && (
        <ul className="catalog-checklist t-body">
          {p.role.checklist.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {checks.length > 0 && <span className="t-label">Commands it proposes</span>}
      {checks.map(([name, spec]) => (
        <code key={name} className="t-code role-check">
          {name}: {argvText(spec.run)}
        </code>
      ))}
      <span className="t-label">Instructions</span>
      <pre className="role-preview">{p.role?.instructions ?? p.text}</pre>
    </>
  );
}
