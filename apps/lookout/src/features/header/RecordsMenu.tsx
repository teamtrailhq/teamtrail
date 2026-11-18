import { HeaderMenu } from './HeaderMenu';
import { type RecordsProps, RecordsItems } from './RecordsItems';

/** The views you open now and then, grouped behind one header button: the trip report, the field guide and trail stats. */
export function RecordsMenu(props: RecordsProps) {
  return (
    <HeaderMenu
      label="Records"
      badge={
        <>
          {props.knowledge > 0 && <span className="n hot">{props.knowledge}</span>}
          {props.briefingStatus === 'new' && <span className="new-dot" aria-label="new trip report" />}
        </>
      }
    >
      {(close) => <RecordsItems {...props} close={close} />}
    </HeaderMenu>
  );
}
