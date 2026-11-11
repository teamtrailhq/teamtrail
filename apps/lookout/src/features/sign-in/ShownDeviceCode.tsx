import { Button, MetaLine } from '../../components/ui';
import { useNow } from '../../hooks';
import { QrCode } from './QrCode';
import type { DeviceCode } from './useSignIns';

/** The code shown, with the QR code of its link and how long it still works. */
export function ShownDeviceCode(props: { device: DeviceCode; onDone: () => void }) {
  const now = useNow(1000);
  const left = Math.max(0, Math.ceil((props.device.expiresAt - now) / 60_000));
  const link = props.device.links[0];
  if (props.device.expiresAt <= now)
    return (
      <div className="si-code">
        <p className="t-meta">That code expired. Make a new one when the device is ready.</p>
        <Button size="sm" onClick={props.onDone}>
          Done
        </Button>
      </div>
    );
  return (
    <div className="si-code">
      {link && <QrCode text={link} label="QR code that pairs another device" />}
      <div className="si-code-words">
        <span className="si-code-value t-code" aria-label="Pairing code">
          {props.device.code}
        </span>
        <MetaLine parts={['Works once', `expires in ${left} min`]} />
        <p className="t-meta si-note">
          Scan it with the device’s camera, or open{' '}
          {link ? <code className="t-code">{link.split('#')[0]}</code> : 'the Lookout'} there and type the code.
        </p>
        <Button size="sm" onClick={props.onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
