import type { ReviewLoad } from '@teamtrail/core';
import { Select, type SelectOption } from '../../components/ui';

const PRESETS = [3, 5, 8, 12];

/** Off, the presets, and the file's own value when someone wrote another one by hand. */
function options(limit?: number): SelectOption<string>[] {
  const values = limit && !PRESETS.includes(limit) ? [...PRESETS, limit].sort((a, b) => a - b) : PRESETS;
  return [{ value: 'off', label: 'Off' }, ...values.map((n) => ({ value: String(n), label: `${n} waiting` }))];
}

const plural = (n: number) => `${n} finished ticket${n === 1 ? '' : 's'}`;

/** What the queue holds now, against the limit: the state, said once. */
function stateLine(review?: ReviewLoad, limit?: number): string {
  const n = review?.waiting.length ?? 0;
  if (!limit) return n ? `${plural(n)} wait for your review now.` : 'Nothing waits for your review now.';
  if (review?.full) return `${plural(n)} wait: agents start no new implementation work until you review some.`;
  return `${n} of ${limit} waiting: agents start new work.`;
}

/**
 * The team's review limit (attention.json): how much finished work may wait for review, in Teamtrail or as open pull
 * requests, before agents start no new implementation work. Writing code got cheap; reviewing it did not.
 */
export function ReviewLimitRow(props: {
  limit?: number;
  review?: ReviewLoad;
  /** False on another device: the limit is set on the machine Teamtrail runs on. */
  local?: boolean;
  onChange: (limit: number | null) => void;
}) {
  const { limit, review } = props;
  return (
    <>
      <div className="att-settings-row set-field">
        <span className="set-field-label">Review limit</span>
        <Select
          compact
          aria-label="Review limit"
          value={limit ? String(limit) : 'off'}
          options={options(limit)}
          disabled={props.local === false}
          onChange={(v) => props.onChange(v === 'off' ? null : Number(v))}
        />
      </div>
      <span className="set-hint t-meta">
        Agents finish rework and keep researching, but start no new implementation work while this many tickets wait for
        your review. {stateLine(review, limit)}
      </span>
    </>
  );
}
