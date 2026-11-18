/** The record files a `trust` server event names (core's watchMachineStore.ts), by path in this machine's store. */
const filesOf = (data: unknown): string[] => {
  const files = (data as { files?: unknown } | undefined)?.files;
  return Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string') : [];
};

const SIGNED = 'signed-state/';
const ACCEPTED = 'tracker-settings/';

/**
 * What a `trust` event says changed in this machine's store: `approvals`, an approval made anywhere (a brief, criteria,
 * knowledge, the risk policy, guides, check commands, a waiver; this page, another tab, another device or
 * `teamtrail approve`); `signed`, a trail's signed record (an outside change accepted, or any write Teamtrail signed),
 * which changes how its files read; `accepted`, a tracker's settings accepted.
 */
export function trustChanged(data: unknown) {
  const files = filesOf(data);
  return {
    approvals: files.some((f) => !f.startsWith(SIGNED) && !f.startsWith(ACCEPTED)),
    signed: files.some((f) => f.startsWith(SIGNED)),
    accepted: files.some((f) => f.startsWith(ACCEPTED)),
  };
}
