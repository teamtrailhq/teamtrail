import { encodeQr } from '../../lib/qr';

const QUIET = 4;

/** `text` as a QR code to scan with a phone's camera: dark on light in either theme, so every camera reads it. */
export function QrCode(props: { text: string; label: string }) {
  const modules = encodeQr(props.text);
  if (!modules) return null;
  const size = modules.length + QUIET * 2;
  const path = modules
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x + QUIET} ${y + QUIET}h1v1h-1z` : '')))
    .join('');
  return (
    <svg
      className="si-qr"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={props.label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
