import { Button } from '../../components/ui';

/**
 * "3 need you": what needs you on this trail, the same number as the trail bar's; a click opens the most urgent. When
 * more wait on other trails, its tip says so (Needs you under the map lists them); with nothing here but something
 * there, a quiet "On other trails" opens that. Gone when nothing needs you anywhere.
 */
export function NeedsButton(props: { count: number; elsewhere: number; top?: string; onOpen: () => void }) {
  const { count, elsewhere } = props;
  const others = elsewhere > 0 ? `${elsewhere} more on other trails` : '';
  if (!count && !elsewhere) return null;
  if (!count)
    return (
      <Button className="needs-btn elsewhere" data-tip={`Nothing here · ${others}`} onClick={props.onOpen}>
        On other trails
      </Button>
    );
  const label = `${count} need${count === 1 ? 's' : ''} you`;
  const tip = [props.top && `Most urgent: ${props.top}`, others].filter(Boolean).join(' · ');
  return (
    <Button
      variant="urgent"
      className="needs-btn"
      data-tip={tip}
      aria-label={others ? `${label} on this trail, ${others}` : label}
      onClick={props.onOpen}
    >
      {label}
    </Button>
  );
}
