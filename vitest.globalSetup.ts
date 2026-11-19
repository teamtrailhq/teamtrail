import { rmSync } from 'node:fs';

/** Removes the run's config dirs (made in vitest.config.ts) when the run ends, passed or failed. */
export default function setup() {
  return () => {
    const scratch = process.env.TEAMTRAIL_VITEST_SCRATCH;
    if (scratch) rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
  };
}
