import { ChangeWindow, type Stamped } from '../sync/changeWindow';
import { changedTrails } from './changedTrails';
import type { LinearGql } from './linearGql';
import { CHANGES_QUERY, LATEST_QUERY, type LChanges } from './schema';

/** Changes per poll; a full page means more changed than one page holds, so everything cached is read again. */
const PAGE = 100;
/** The cursor before a team has any issue. */
const EPOCH = '1970-01-01T00:00:00.000Z';

/**
 * Which trails changed in a Linear team since the last poll: issues and comments updated at or after the cursor
 * (`gte`, so a change stamped the same instant as the last one seen still shows). The first cursor comes from
 * Linear's newest issue, never this machine's clock, so a clock that runs ahead misses nothing.
 */
export class LinearChanges {
  private window = new ChangeWindow();

  constructor(
    private readonly gql: LinearGql,
    private readonly teamId: string,
  ) {}

  /** `known` maps an issue id to its cached trail; `'all'` when the trail list may have changed too. */
  async poll(known: (ref: string) => string | undefined): Promise<string[] | 'all'> {
    const team = { team: { id: { eq: this.teamId } } };
    const since = this.window.since;
    if (since === undefined) {
      const d = await this.gql<{ issues: { nodes: { updatedAt: string }[] } }>(LATEST_QUERY, { issues: team });
      this.window.start(d.issues.nodes[0]?.updatedAt ?? EPOCH);
      return 'all';
    }
    const d = await this.gql<LChanges>(CHANGES_QUERY, {
      issues: { ...team, updatedAt: { gte: since } },
      comments: { updatedAt: { gte: since }, issue: team },
      first: PAGE,
    });
    const fresh = new Set(this.window.take(stampsOf(d)).map((s) => s.key));
    if (d.issues.pageInfo?.hasNextPage || d.comments.pageInfo?.hasNextPage) return 'all';
    return changedTrails(
      {
        issues: { nodes: d.issues.nodes.filter((i) => fresh.has(`issue:${i.id}`)) },
        comments: { nodes: d.comments.nodes.filter((c, n) => fresh.has(commentKey(c, n))) },
      },
      known,
    );
  }
}

const commentKey = (c: LChanges['comments']['nodes'][number], n: number) => `comment:${c.id ?? `${c.issue?.id}#${n}`}`;

const stampsOf = (d: LChanges): Stamped[] => [
  ...d.issues.nodes.map((i) => ({ key: `issue:${i.id}`, at: i.updatedAt })),
  ...d.comments.nodes.map((c, n) => ({ key: commentKey(c, n), at: c.updatedAt })),
];
