/*
 * The Teamtrail version this process runs, as the CLI build knows it: set once at start (cli.ts), unknown in tests
 * and unbuilt sources. Written next to what this process hands another one (answers, session docs, the Lookout
 * lock), so either side can say plainly when they run different versions.
 */
let version: string | undefined;

export const setRunningVersion = (v: string | undefined) => {
  version = v;
};

export const runningVersion = () => version;
