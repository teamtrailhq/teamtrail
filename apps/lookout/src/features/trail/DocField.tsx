import { useId, useRef, useState, type ReactNode } from 'react';
import { Button, Tabs } from '../../components/ui';
import { cx } from '../../lib';
import { TEXT_FILE_ACCEPT } from '../../lib/readTextFile';
import { DocPreview } from './DocPreview';
import { FieldLimit } from './FieldLimit';
import { LoadPrompt } from './LoadPrompt';
import { useAutoResize } from './useAutoResize';
import { useLoadFile } from './useLoadFile';

type Mode = 'write' | 'preview';
const MODES: { id: Mode; label: string }[] = [
  { id: 'write', label: 'Write' },
  { id: 'preview', label: 'Preview' },
];

/**
 * A field for a markdown document (a trail's destination or notes): it grows with its text, Preview shows it as the
 * Lookout will, and Load from file (or a file dropped on it) puts a local .md or .txt file's text in it to edit.
 */
export function DocField(props: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  className?: string;
  /** What Preview shows instead of a markdown rendering (the assumptions, as the list they become). */
  preview?: ReactNode;
  /** Without Load from file (the assumptions). */
  noFile?: boolean;
  /** Under the field: what it will make (the assumptions' count). */
  footer?: ReactNode;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>('write');
  const [dropping, setDropping] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const file = useLoadFile({ value: props.value, onChange: props.onChange, max: props.max, label: props.label });
  useAutoResize(area, props.value, mode === 'write');
  const takesFiles = !props.noFile;
  return (
    <div
      className={cx('doc-field', dropping && 'dropping', props.className)}
      onDragOver={(e) => {
        if (!takesFiles || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        if (!takesFiles) return;
        e.preventDefault();
        setDropping(false);
        setMode('write');
        void file.load(e.dataTransfer.files[0]);
      }}
    >
      <div className="doc-field-head">
        <label className="new-trail-label" htmlFor={id}>
          {props.label}
        </label>
        <span className="doc-field-tools">
          {takesFiles && (
            <Button size="sm" variant="ghost" onClick={() => picker.current?.click()}>
              Load from file
            </Button>
          )}
          <Tabs className="doc-tabs" value={mode} onChange={setMode} items={MODES} />
        </span>
      </div>
      {props.hint && <p className="t-meta doc-field-hint">{props.hint}</p>}
      {takesFiles && (
        <input
          ref={picker}
          type="file"
          hidden
          accept={TEXT_FILE_ACCEPT}
          aria-label={`Load ${props.label} from a file`}
          onChange={(e) => {
            void file.load(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      )}
      {mode === 'write' ? (
        <textarea
          id={id}
          ref={area}
          rows={4}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <DocPreview text={props.value} preview={props.preview} />
      )}
      {file.pending && (
        <LoadPrompt
          file={file.pending}
          field={props.label}
          onReplace={file.replace}
          onAppend={file.append}
          onCancel={file.cancel}
        />
      )}
      {file.message && (
        <p className="vf-err" role="alert">
          {file.message}
        </p>
      )}
      <FieldLimit length={props.value.trim().length} max={props.max} label={props.label} />
      {props.footer}
    </div>
  );
}
