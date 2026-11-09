import { MetaLine } from '../../components/ui';

/** Who and where, before connecting: "Will use Engineering in Octo Inc as Ada Ops", the email, and another key. */
export function LinearIdentity(props: { line?: string; email?: string; onUseAnother?: () => void }) {
  if (!props.line) return null;
  return (
    <div className="gh-identity">
      <div className="ln-who">
        <span className="t-body">{props.line}</span>
        {props.email && <MetaLine parts={[props.email]} />}
      </div>
      {props.onUseAnother && (
        <button type="button" className="btn ghost sm" onClick={props.onUseAnother}>
          Use another key
        </button>
      )}
    </div>
  );
}
