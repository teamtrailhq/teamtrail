/** Opens the catalog repo's issue form to report a role, when the catalog names its repo. */
export function ReportLink(props: { repo?: string; id: string; version: string }) {
  if (!props.repo) return null;
  const title = encodeURIComponent(`Report: ${props.id} ${props.version}`);
  const href = `${props.repo.replace(/\/+$/, '')}/issues/new?template=report-role.yml&title=${title}`;
  return (
    <a className="report-link t-meta" href={href} target="_blank" rel="noreferrer">
      Report this role
    </a>
  );
}
