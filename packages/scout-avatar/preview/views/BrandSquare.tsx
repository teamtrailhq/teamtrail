import { Badge, Logo } from '../../src/scout';

/** Brand exports: the logo, or Scout's badge for places where Scout is the one talking, like Slack. */
export function BrandSquare({ n, who }: { n: number; who: 'logo' | 'scout' }) {
  const size = Math.round(n * 0.86);
  return (
    <div className="brand-square" data-capture="square" style={{ width: n, height: n }}>
      {who === 'scout' ? <Badge size={size} /> : <Logo size={n} />}
    </div>
  );
}
