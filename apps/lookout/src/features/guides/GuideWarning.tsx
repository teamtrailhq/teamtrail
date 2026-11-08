import { useGuides } from './useGuides';

/** Under a ticket whose guide agents can't use: why, and what it means for claims. */
export function GuideWarning(props: { id: string }) {
  const { view, find } = useGuides();
  if (!view) return null;
  const r = find(props.id);
  if (r?.status === 'active') return null;
  const why = r ? (r.reason ?? r.status) : 'it is not installed';
  return (
    <p className="guide-warning t-meta">
      Guide {props.id} can't be used: {why}. Claims get no guide instructions until you approve it in Settings → Guides.
    </p>
  );
}
