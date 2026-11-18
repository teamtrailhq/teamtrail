import { useNight } from '../../hooks';

/** The day or night theme as a menu item, for the phone's More menu (ThemeToggle.tsx elsewhere). */
export function ThemeItem(props: { onToggle: (night: boolean) => void; close: () => void }) {
  const night = useNight();
  return (
    <button
      role="menuitem"
      className="header-menu-item"
      onClick={() => {
        props.close();
        props.onToggle(!night);
      }}
    >
      {night ? 'Day theme' : 'Night theme'}
    </button>
  );
}
