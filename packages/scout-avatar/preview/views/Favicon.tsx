import { Logo } from '../../src/scout';

/** The favicon at its size: the blaze tile, the same on light and dark browser tabs. */
export function Favicon({ px }: { px: number }) {
  return (
    <div className="favicon" data-capture="favicon" style={{ width: px, height: px }}>
      <Logo size={px} theme="blaze" />
    </div>
  );
}
