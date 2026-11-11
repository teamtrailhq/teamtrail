import { Logo } from '../../src/scout';

/** The bare mark at favicon size: `light` for light browser tabs, `dark` for dark ones. */
export function Favicon({ px, theme }: { px: number; theme: 'light' | 'dark' }) {
  return (
    <div className="favicon" data-capture="favicon" style={{ width: px, height: px }}>
      <Logo size={px} bare theme={theme} />
    </div>
  );
}
