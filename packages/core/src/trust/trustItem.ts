/** What a pending approval is about. */
export type TrustKind =
  'checks' | 'catalogs' | 'brief' | 'criteria' | 'knowledge' | 'policy' | 'level' | 'type' | 'state';

/**
 * Something the repo's files ask this machine to trust that the trail lead hasn't approved here, as it is now.
 * Until they do, it opens no gate (see each store). Approving records `content`, the exact text `hash` was taken
 * from, never the file as it is by then: a file that changed in between still waits.
 */
export interface TrustItem {
  /** The ledger key: `checks`, `brief:<mapId>`, `criteria:<mapId>:<ticketId>`, `knowledge:<id>`, `policy`, `catalogs`, `level:…`. */
  key: string;
  kind: TrustKind;
  hash: string;
  /** What approving approves, exactly: the text `hash` is the sha256 of. */
  content: string;
  /** `elsewhere`: never approved on this machine. `changed`: differs from what was approved here. */
  standing: 'elsewhere' | 'changed';
  /** What it is, in one line. */
  title: string;
  /** What approving would approve: the content for `elsewhere`, what changed for `changed`. */
  lines: string[];
  /** Advice, never a refusal: a check command that runs a shell, reaches the network, … */
  warnings: string[];
  /** The file it comes from, relative to the tracker folder; none for a tracker that isn't files. */
  file?: string;
  /** The files it comes from, when there are several (a trail's files nobody signed, accepted together). */
  files?: string[];
  /**
   * Trail state only: what Revert does. `restore` writes the signed values back; `delete` removes the files nobody
   * signed (`file`/`files`), which the human confirms by naming them; `none`: not offered.
   */
  revert?: 'restore' | 'delete' | 'none';
  /**
   * The file is in git's HEAD as it is now: someone committed it. Only such items can be approved together; anything
   * an agent wrote since is approved one at a time, read whole. Set where it is shown (trustRoutes.ts).
   */
  committed?: boolean;
  /** Approved only on its own, never in a bulk adoption: guide catalogs, check commands Teamtrail can't place. */
  alone?: boolean;
  mapId?: string;
  ticketId?: string;
}
