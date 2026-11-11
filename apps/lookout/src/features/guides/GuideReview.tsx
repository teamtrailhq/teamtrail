import type { InstalledGuide } from '@teamtrail/core';
import { Button } from '../../components/ui';
import { CatalogPreviewBody } from './CatalogPreviewBody';

/**
 * A guide file waiting for the trail lead, shown whole above its Approve button: approving names the hash of exactly
 * this text, so a file changed after the page loaded is refused and shown again.
 */
export function GuideReview(props: { r: InstalledGuide; busy?: boolean; onApprove: (sha256: string) => void }) {
  const { r } = props;
  if (!r.guide || !r.sha256) return null;
  const sha256 = r.sha256;
  return (
    <div className="guide-review">
      <CatalogPreviewBody p={{ findings: r.findings, guide: r.guide }} />
      <Button
        size="sm"
        aria-label={`Approve guide ${r.id}`}
        disabled={props.busy}
        onClick={() => props.onApprove(sha256)}
      >
        Approve
      </Button>
    </div>
  );
}
