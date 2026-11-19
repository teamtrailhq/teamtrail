/**
 * Says what a run's tests left in its temp folder (already removed by now) and whether that fails the run: a test
 * that makes a temp folder removes it, passed or failed. Returns true when something was left.
 */
export function reportLeftovers(label, left) {
  if (!left.length) return false;
  const shown = left.slice(0, 20).map((name) => `  ${name}`);
  const more = left.length > shown.length ? [`  … and ${left.length - shown.length} more`] : [];
  console.error(
    [
      `\n✖ ${label}: tests left ${left.length} item(s) in the temp folder (removed now). Remove what a test makes:`,
      ...shown,
      ...more,
    ].join('\n'),
  );
  return true;
}
