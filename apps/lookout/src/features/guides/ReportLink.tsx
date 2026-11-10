import { webUrl } from '@teamtrail/core';

/** Opens the catalog repo's issue form to report a guide, when the catalog names its repo. */
export function ReportLink(props: { repo?: string; id: string; version: string }) {
  const repo = webUrl(props.repo);
  if (!repo) return null;
  const title = encodeURIComponent(`Report: ${props.id} ${props.version}`);
  const href = `${repo.replace(/\/+$/, '')}/issues/new?template=report-guide.yml&title=${title}`;
  return (
    <a className="report-link t-meta" href={href} target="_blank" rel="noreferrer">
      Report this guide
    </a>
  );
}
