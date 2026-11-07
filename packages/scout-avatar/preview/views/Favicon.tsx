import { Logo } from '../../src/scout';

export function Favicon({ px }: { px: number }) {
  return (
    <div className="favicon" data-capture="favicon" style={{ width: px, height: px }}>
      <Logo size={px} bare />
    </div>
  );
}
