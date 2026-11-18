const n = (x: number) => x.toLocaleString('en-US');

/**
 * How much of a field's limit its text takes: nothing until it is close (past 80%), then the count, and once it is
 * over, what to do. Over the limit, Create stays off.
 */
export function FieldLimit({ length, max, label }: { length: number; max: number; label: string }) {
  if (length > max)
    return (
      <p className="vf-err" role="alert">
        {label}: {n(length)} characters, at most {n(max)}. Shorten it to create the trail.
      </p>
    );
  if (length < max * 0.8) return null;
  return (
    <p className="t-meta doc-count">
      {n(length)} of {n(max)} characters
    </p>
  );
}
