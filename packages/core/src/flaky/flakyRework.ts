/** What an agent is told when a pass that only a retry got is sent back: fix the cause, never hide it. */
export const FLAKY_REWORK =
  "The checks passed only on retry, with no change to the code: the test is flaky. Find the root cause and fix it. Don't add sleeps or retries, don't rerun until it passes, don't skip the test. If you can't fix it, delete the test and say why in your completion.";
