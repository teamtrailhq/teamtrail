/**
 * In-memory stand-in for the slice of Linear's GraphQL API the adapter uses,
 * dispatched on operation name. Field names follow the live schema
 * (introspected from api.linear.app); used to record the flow fixtures.
 */
interface LIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  stateId: string;
  labelIds: string[];
  parentId?: string;
  projectId?: string;
}

/** Another team the key can access, beyond the one whose issues the fake holds. */
export interface FakeLinearTeam {
  id: string;
  key: string;
  name: string;
  /** Latest issue update, for the picker's activity line. */
  activeAt?: string;
  projects?: { id: string; name: string; state?: string }[];
  /** Listed in `teams`, but `team(id)` refuses it: a team the key can see but not read. */
  unreadable?: boolean;
}

const AUTH_ERROR = {
  message: 'Authentication required, not authenticated',
  extensions: { type: 'authentication error', code: 'AUTHENTICATION_ERROR', statusCode: 401 },
};

class NotFound extends Error {}

export function fakeLinear(
  opts: {
    start?: number;
    /** When set, any other key is refused with 401, like api.linear.app. */
    apiKey?: string;
    viewer?: { name: string; email?: string };
    org?: string;
    /** Other teams the key can access, listed after the main one. */
    teams?: FakeLinearTeam[];
  } = {},
) {
  let clock = opts.start ?? Date.UTC(2026, 9, 31, 12, 0, 0);
  const tick = () => new Date((clock += 1000)).toISOString();
  let n = 0;
  const uid = (p: string) => `${p}-${String(++n).padStart(4, '0')}-fake`;
  const team = { id: 'team-eng', key: 'ENG', name: 'Engineering' };
  const viewer = { id: 'usr-ada', name: opts.viewer?.name ?? 'Ada Ops', email: opts.viewer?.email ?? 'ada@octo.dev' };
  /** A comment's `user`: the key's own user, another member of the workspace, or null for an integration. */
  const userOf = (name: string | null) => {
    if (name === null) return null;
    return name === viewer.name
      ? { id: viewer.id, displayName: name }
      : { id: `usr-${name.toLowerCase()}`, displayName: name };
  };
  const org = { name: opts.org ?? 'Octo Inc' };
  const mainProjects = [{ id: 'proj-mobile', name: 'Mobile', state: 'started' }];
  const allTeams = (): FakeLinearTeam[] => [{ ...team, projects: mainProjects }, ...(opts.teams ?? [])];
  const teamById = (id: string) => allTeams().find((t) => t.id === id && !t.unreadable);
  /** Cursor pages over a list, like Linear's connections: the cursor is the index to start from. */
  const paged = <T>(list: T[], first = 50, after?: string | null) => {
    const from = after ? Number(after) : 0;
    const nodes = list.slice(from, from + first);
    const end = from + nodes.length;
    return { nodes, pageInfo: { hasNextPage: end < list.length, endCursor: nodes.length ? String(end) : null } };
  };
  const activeAt = (t: FakeLinearTeam) => {
    if (t.id !== team.id) return t.activeAt;
    const latest = [...issues.values()]
      .map((i) => i.updatedAt)
      .sort()
      .at(-1);
    return latest ?? t.activeAt;
  };
  const states = [
    { id: 'st-backlog', name: 'Backlog', type: 'backlog', position: 0 },
    { id: 'st-todo', name: 'Todo', type: 'unstarted', position: 1 },
    { id: 'st-done', name: 'Done', type: 'completed', position: 3 },
    { id: 'st-canceled', name: 'Canceled', type: 'canceled', position: 4 },
    { id: 'st-dup', name: 'Duplicate', type: 'canceled', position: 5 },
  ];
  const labels = new Map<string, { id: string; name: string; teamId: string | null }>([
    ['lbl-bug', { id: 'lbl-bug', name: 'Bug', teamId: null }],
  ]);
  const issues = new Map<string, LIssue>();
  const comments: {
    id: string;
    issueId: string;
    body: string;
    createdAt: string;
    updatedAt: string;
    user: string | null;
  }[] = [];
  let relations: { id: string; issueId: string; relatedIssueId: string; type: string }[] = [];
  let seq = 0;

  const stateOf = (i: LIssue) => states.find((s) => s.id === i.stateId)!;
  const view = (i: LIssue, withRel: boolean): Record<string, unknown> => ({
    id: i.id,
    identifier: i.identifier,
    title: i.title,
    description: i.description,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    completedAt: i.completedAt,
    canceledAt: i.canceledAt,
    state: { type: stateOf(i).type },
    labels: { nodes: i.labelIds.map((id) => ({ id, name: labels.get(id)!.name })) },
    assignee: null,
    comments: {
      nodes: comments
        .filter((c) => c.issueId === i.id)
        .map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, user: userOf(c.user) })),
    },
    ...(withRel
      ? {
          inverseRelations: {
            nodes: relations
              .filter((r) => r.relatedIssueId === i.id)
              .map((r) => ({ type: r.type, issue: { id: r.issueId } })),
          },
        }
      : {}),
  });

  function create(input: Record<string, unknown>) {
    const now = tick();
    const i: LIssue = {
      id: uid('iss'),
      identifier: `${team.key}-${++seq}`,
      title: String(input.title),
      description: (input.description as string) ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      canceledAt: null,
      stateId: 'st-todo',
      labelIds: (input.labelIds as string[]) ?? [],
      parentId: input.parentId as string | undefined,
      projectId: input.projectId as string | undefined,
    };
    issues.set(i.id, i);
    return i;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GraphQL variables arrive untyped
  function op(name: string, v: Record<string, any>): unknown {
    switch (name) {
      case 'Test':
        return {
          viewer,
          organization: org,
          teams: { nodes: allTeams().map(({ id, key, name }) => ({ id, key, name })) },
        };
      case 'Viewer':
        return { viewer, organization: org };
      case 'Teams': {
        const page = paged(allTeams(), v.first, v.after);
        const nodes = page.nodes.map((t) => {
          const at = activeAt(t);
          return { id: t.id, key: t.key, name: t.name, issues: { nodes: at ? [{ updatedAt: at }] : [] } };
        });
        return { teams: { ...page, nodes } };
      }
      case 'Projects': {
        const t = teamById(v.id);
        if (!t) throw new NotFound('Team');
        const projects = (t.projects ?? []).map(({ id, name }) => ({ id, name }));
        return { team: { id: t.id, key: t.key, name: t.name, projects: { nodes: projects } } };
      }
      case 'TeamProjects': {
        const t = teamById(v.id);
        if (!t) throw new NotFound('Team');
        return { team: { projects: paged(t.projects ?? [], v.first, v.after) } };
      }
      case 'Team':
        return {
          team: teamById(v.id) ? { ...teamById(v.id)!, states: { nodes: states } } : null,
          issueLabels: {
            nodes: [...labels.values()]
              .filter((l) => l.name.startsWith(v.prefix))
              .map((l) => ({ id: l.id, name: l.name, team: l.teamId ? { id: l.teamId } : null })),
          },
        };
      case 'Label': {
        const l = { id: uid('lbl'), name: v.input.name, teamId: v.input.teamId };
        labels.set(l.id, l);
        return { issueLabelCreate: { issueLabel: { id: l.id, name: l.name } } };
      }
      case 'Trails': {
        const want = v.filter.labels.some.name.eq;
        const nodes = [...issues.values()].filter(
          (i) =>
            i.labelIds.some((id) => labels.get(id)!.name === want) &&
            (!v.filter.project || i.projectId === v.filter.project.id.eq),
        );
        return { issues: { nodes: nodes.map((i) => ({ id: i.id, identifier: i.identifier, title: i.title })) } };
      }
      case 'Trail': {
        const root = issues.get(v.id);
        if (!root) return { issue: null };
        const kids = [...issues.values()].filter((i) => i.parentId === root.id);
        return {
          viewer: { id: viewer.id },
          issue: { ...view(root, false), children: { nodes: kids.map((k) => view(k, true)) } },
        };
      }
      case 'Changes': {
        const since = v.issues.updatedAt.gt;
        return {
          issues: {
            nodes: [...issues.values()]
              .filter((i) => i.updatedAt > since)
              .map((i) => ({
                id: i.id,
                updatedAt: i.updatedAt,
                parent: i.parentId ? { id: i.parentId } : null,
                labels: { nodes: i.labelIds.map((id) => ({ name: labels.get(id)!.name })) },
              })),
          },
          comments: {
            nodes: comments
              .filter((c) => c.updatedAt > since)
              .map((c) => ({
                updatedAt: c.updatedAt,
                issue: {
                  id: c.issueId,
                  parent: issues.get(c.issueId)!.parentId ? { id: issues.get(c.issueId)!.parentId } : null,
                },
              })),
          },
        };
      }
      case 'Create':
        return { issueCreate: { issue: view(create(v.input), false) } };
      case 'Update': {
        const i = issues.get(v.id)!;
        const inp = v.input;
        if (inp.title !== undefined) i.title = inp.title;
        if (inp.description !== undefined) i.description = inp.description;
        if (inp.stateId) {
          i.stateId = inp.stateId;
          const t = stateOf(i).type;
          i.completedAt = t === 'completed' ? tick() : null;
          i.canceledAt = t === 'canceled' ? tick() : null;
        }
        if (inp.addedLabelIds) i.labelIds = [...new Set([...i.labelIds, ...inp.addedLabelIds])];
        if (inp.removedLabelIds) i.labelIds = i.labelIds.filter((x) => !inp.removedLabelIds.includes(x));
        i.updatedAt = tick();
        return { issueUpdate: { success: true } };
      }
      case 'Block':
        relations.push({
          id: uid('rel'),
          issueId: v.input.issueId,
          relatedIssueId: v.input.relatedIssueId,
          type: v.input.type,
        });
        return { issueRelationCreate: { success: true } };
      case 'Relations': {
        const nodes = relations
          .filter((r) => r.relatedIssueId === v.id)
          .map((r) => ({ id: r.id, type: r.type, issue: { id: r.issueId } }));
        return { issue: issues.has(v.id) ? { inverseRelations: { nodes } } : null };
      }
      case 'Unblock':
        relations = relations.filter((r) => r.id !== v.id);
        return { issueRelationDelete: { success: true } };
      case 'Comment': {
        const now = tick();
        const c = {
          id: uid('cmt'),
          issueId: v.input.issueId,
          body: v.input.body,
          createdAt: now,
          updatedAt: now,
          user: viewer.name,
        };
        comments.push(c);
        return { commentCreate: { comment: { id: c.id } } };
      }
      case 'EditComment': {
        const c = comments.find((x) => x.id === v.id)!;
        c.body = v.input.body;
        c.updatedAt = tick();
        return { commentUpdate: { success: true } };
      }
    }
    throw new Error(`fake linear: unsupported operation ${name}`);
  }

  const fetch = async (_input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const { query, variables } = JSON.parse(String(init.body));
    const name = String(query).match(/^\s*(?:query|mutation)\s+(\w+)/)?.[1] ?? '';
    const headers = {
      'content-type': 'application/json',
      'x-ratelimit-requests-limit': '1500',
      'x-ratelimit-requests-remaining': '1490',
      'x-ratelimit-requests-reset': String(clock + 3_600_000),
    };
    const auth = new Headers(init.headers).get('authorization');
    if (opts.apiKey && auth !== opts.apiKey && auth !== `Bearer ${opts.apiKey}`)
      return new Response(JSON.stringify({ errors: [AUTH_ERROR] }), { status: 401, headers });
    try {
      return new Response(JSON.stringify({ data: op(name, variables ?? {}) }), { status: 200, headers });
    } catch (err) {
      if (!(err instanceof NotFound)) throw err;
      // What api.linear.app answers for an id the key can't see.
      const error = { message: `Entity not found: ${err.message}`, extensions: { code: 'INVALID_INPUT' } };
      return new Response(JSON.stringify({ data: null, errors: [error] }), { status: 200, headers });
    }
  };

  return {
    team,
    issues,
    fetch: fetch as typeof globalThis.fetch,
    human: {
      complete(id: string) {
        const i = issues.get(id)!;
        i.stateId = 'st-done';
        i.completedAt = tick();
        i.updatedAt = tick();
      },
      /** A member of the workspace comments; `null` is an integration (no user). */
      comment(issueId: string, user: string | null, body: string) {
        const now = tick();
        comments.push({ id: uid('cmt'), issueId, body, createdAt: now, updatedAt: now, user });
      },
      /** Anyone in the workspace edits an issue's description; Linear doesn't say who. */
      editDescription(id: string, description: string) {
        Object.assign(issues.get(id)!, { description, updatedAt: tick() });
      },
    },
  };
}
