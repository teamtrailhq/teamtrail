import { Badge } from '../components/ui';
import { type View, VIEW_TABS } from './tabs';

/** Fixed bottom tab bar on phones, the header's views: the map carries how many things need you. */
export function PhoneTabBar(props: { view: View; covered: boolean; needs: number; onPick: (view: View) => void }) {
  const { view, covered, needs } = props;
  return (
    <nav className="tabbar">
      {VIEW_TABS.map(({ id, label }) => (
        <button key={id} className={view === id && !covered ? 'on' : ''} onClick={() => props.onPick(id)}>
          {label}
          {id === 'map' && needs > 0 && <Badge key={needs} n={needs} urgent pop />}
        </button>
      ))}
    </nav>
  );
}
