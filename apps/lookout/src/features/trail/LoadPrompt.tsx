import { Button } from '../../components/ui';
import type { PendingFile } from './useLoadFile';

/** A loaded file and a field that already has text: replace it, add the file after it, or leave it. */
export function LoadPrompt(props: {
  file: PendingFile;
  field: string;
  onReplace: () => void;
  onAppend: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="doc-load-prompt" role="group" aria-label={`Load ${props.file.name}`}>
      <span className="t-meta">
        {props.field} already has text. Replace it with <b className="t-code">{props.file.name}</b>, or add the file
        after it?
      </span>
      <span className="doc-load-actions">
        <Button size="sm" onClick={props.onReplace}>
          Replace
        </Button>
        <Button size="sm" onClick={props.onAppend}>
          Append
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </span>
    </div>
  );
}
