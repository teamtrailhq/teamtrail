import { createHash } from 'node:crypto';

/**
 * In-memory stand-in for the slice of the GitHub REST + GraphQL API the
 * adapter uses. Response shapes follow the live API (see the `github-live-*`
 * fixtures, recorded against api.github.com), trimmed to the fields read.
 * Used to record the flow fixtures and to drive the browser demo.
 */
export interface FakeIssue {
  id: number;
  node_id: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  state_reason: string | null;
  labels: string[];
  assignees: string[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  comments: {
    id: number;
    body: string;
    created_at: string;
    user: string | null;
    /** Who edited it last (null: a deleted account), and when; never edited when `edited_at` is unset. */
    editor?: string | null;
    edited_at?: string;
  }[];
  /** Who opened the issue, and who last edited its body (null: never edited). */
  author: string;
  editor: string | null;
  edited_at?: string;
  subIssues: number[];
  blockedBy: number[];
}

type Res = { status: number; headers?: Record<string, string>; body?: unknown };

/** A repo in `GET /user/repos` and `GET /repos/<owner>/<name>`, beyond the one whose issues the fake holds. */
export interface FakeRepo {
  full_name: string;
  private?: boolean;
  archived?: boolean;
  has_issues?: boolean;
  pushed_at?: string;
  permissions?: Record<string, boolean>;
}

const WRITE = { admin: false, maintain: false, push: true, triage: true, pull: true };

export function fakeGitHub(
  opts: {
    repo?: string;
    login?: string;
    start?: number;
    /** Other repos the login can see, listed after the main one. */
    repos?: FakeRepo[];
    /** When set, any other bearer token is refused with 401. */
    token?: string;
    /** Collaborators with write access (`COLLABORATOR`, permission write). */
    team?: string[];
    /** Read-only collaborators (`COLLABORATOR`, permission read). */
    readers?: string[];
    /** Members of the owning org with no access to this repo (`MEMBER`, not a collaborator). */
    members?: string[];
  } = {},
) {
  const repo = opts.repo ?? 'octo-org/launchpad';
  const login = opts.login ?? 'octo-dev';
  const allRepos: FakeRepo[] = [{ full_name: repo, private: true, permissions: WRITE }, ...(opts.repos ?? [])];
  const repoJson = (r: FakeRepo) => ({
    full_name: r.full_name,
    private: r.private ?? false,
    archived: r.archived ?? false,
    has_issues: r.has_issues ?? true,
    pushed_at: r.pushed_at ?? '2026-10-30T09:00:00Z',
    permissions: r.permissions ?? WRITE,
  });
  let clock = opts.start ?? Date.UTC(2026, 9, 31, 12, 0, 0);
  let nextNumber = 1;
  let nextComment = 9001;
  const issues = new Map<number, FakeIssue>();
  const labels = new Set<string>(['bug', 'enhancement']);
  const tick = () => new Date((clock += 1000)).toISOString().replace('.000Z', 'Z');
  const rate = (): Record<string, string> => ({
    'x-ratelimit-limit': '5000',
    'x-ratelimit-remaining': '4990',
    'x-ratelimit-reset': String(Math.floor(clock / 1000) + 3600),
  });
  const byId = (id: number) => [...issues.values()].find((i) => i.id === id);
  const team = new Set(opts.team ?? []);
  const readers = new Set(opts.readers ?? []);
  const members = new Set(opts.members ?? []);
  const association = (user: string | null) => {
    if (user === login || (user && (team.has(user) || readers.has(user)))) return 'COLLABORATOR';
    return user && members.has(user) ? 'MEMBER' : 'NONE';
  };
  const permissionOf = (user: string) => {
    if (user === login || team.has(user)) return { permission: 'write', role_name: 'write' };
    return readers.has(user) ? { permission: 'read', role_name: 'read' } : undefined;
  };
  const permissionChecks: string[] = [];
  const actor = (user: string | null | undefined) => (user ? { login: user } : null);

  const rest = (i: FakeIssue) => ({
    id: i.id,
    node_id: i.node_id,
    number: i.number,
    title: i.title,
    body: i.body,
    state: i.state,
    state_reason: i.state_reason,
    labels: i.labels.map((name) => ({ name })),
    assignees: i.assignees.map((l) => ({ login: l })),
    created_at: i.created_at,
    updated_at: i.updated_at,
    closed_at: i.closed_at,
    html_url: `https://github.com/${repo}/issues/${i.number}`,
  });

  const gql = (i: FakeIssue, withBlocked: boolean): Record<string, unknown> => ({
    id: i.node_id,
    databaseId: i.id,
    number: i.number,
    title: i.title,
    body: i.body ?? '',
    state: i.state.toUpperCase(),
    stateReason: i.state_reason ? i.state_reason.toUpperCase() : null,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    closedAt: i.closed_at,
    author: actor(i.author),
    editor: i.edited_at ? actor(i.editor) : null,
    lastEditedAt: i.edited_at ?? null,
    authorAssociation: association(i.author),
    labels: { nodes: i.labels.map((name) => ({ name })) },
    assignees: { nodes: i.assignees.map((l) => ({ login: l })) },
    comments: {
      nodes: i.comments.map((c) => ({
        databaseId: c.id,
        body: c.body,
        createdAt: c.created_at,
        author: actor(c.user),
        editor: c.edited_at ? actor(c.editor) : null,
        lastEditedAt: c.edited_at ?? null,
        authorAssociation: association(c.user),
      })),
    },
    ...(withBlocked ? { blockedBy: { nodes: i.blockedBy.map((id) => ({ number: byId(id)!.number })) } } : {}),
  });

  const etagOf = (v: unknown) => `"${createHash('sha1').update(JSON.stringify(v)).digest('hex')}"`;

  function createIssue(b: { title: string; body?: string; labels?: string[]; author?: string }): FakeIssue {
    const n = nextNumber++;
    const now = tick();
    const i: FakeIssue = {
      id: 3_100_000_000 + n,
      node_id: `I_kwDOfake${n}`,
      number: n,
      title: b.title,
      body: b.body ?? null,
      state: 'open',
      state_reason: null,
      labels: b.labels ?? [],
      assignees: [],
      created_at: now,
      updated_at: now,
      closed_at: null,
      comments: [],
      author: b.author ?? login,
      editor: null,
      subIssues: [],
      blockedBy: [],
    };
    for (const l of i.labels) labels.add(l);
    issues.set(n, i);
    return i;
  }

  function handle(method: string, url: URL, headers: Headers, body: unknown): Res {
    const p = url.pathname.replace(/^\/api\/v3/, '');
    const base = `/repos/${repo}`;
    const ok = (b: unknown, status = 200): Res => ({
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', ...rate() },
      body: b,
    });
    const notFound: Res = {
      status: 404,
      headers: rate(),
      body: { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' },
    };

    if (p === '/graphql' || p === '/api/graphql') {
      const { query, variables } = body as { query: string; variables: { number: number } };
      if (/query Me\b/.test(query)) return ok({ data: { viewer: { login } } });
      if (!/query Trail\b/.test(query))
        return { status: 200, body: { errors: [{ type: 'INTERNAL', message: 'fake: unsupported query' }] } };
      const root = issues.get(variables.number);
      const issue = root
        ? { ...gql(root, false), subIssues: { nodes: root.subIssues.map((n) => gql(issues.get(n)!, true)) } }
        : null;
      return ok({ data: { viewer: { login }, repository: { issue } } });
    }
    if (opts.token && headers.get('authorization') !== `Bearer ${opts.token}`)
      return { status: 401, headers: rate(), body: { message: 'Bad credentials' } };
    if (method === 'GET' && p === '/user') return ok({ login, id: 4242, type: 'User' });
    if (method === 'GET' && p === '/user/repos') return userRepos(url);
    const other = allRepos.find((r) => r.full_name !== repo && p === `/repos/${r.full_name}`);
    if (method === 'GET' && other) return ok(repoJson(other));
    const perm = p.match(new RegExp(`^${base}/collaborators/([^/]+)/permission$`));
    if (method === 'GET' && perm) {
      const user = decodeURIComponent(perm[1]);
      permissionChecks.push(user);
      const found = permissionOf(user);
      return found ? ok({ ...found, user: { login: user } }) : notFound;
    }
    if (!p.startsWith(base)) return notFound;
    const rest_ = p.slice(base.length);

    if (method === 'GET' && rest_ === '')
      return ok({
        full_name: repo,
        private: true,
        has_issues: true,
        permissions: { admin: false, maintain: false, push: true, triage: true, pull: true },
      });
    if (method === 'GET' && rest_ === '/labels') return ok([...labels].map((name) => ({ name })));
    if (method === 'POST' && rest_ === '/labels') {
      const { name } = body as { name: string };
      if (labels.has(name)) return { status: 422, body: { message: 'Validation Failed' } };
      labels.add(name);
      return ok({ name }, 201);
    }
    if (method === 'GET' && rest_ === '/issues') {
      const want = (url.searchParams.get('labels') ?? '').split(',').filter(Boolean);
      let list = [...issues.values()].filter((i) => want.every((l) => i.labels.includes(l)));
      if (url.searchParams.get('sort') === 'updated') list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      else list.sort((a, b) => b.number - a.number);
      list = list.slice(0, Number(url.searchParams.get('per_page') ?? 30));
      const out = list.map(rest);
      const etag = etagOf(out);
      if (headers.get('if-none-match') === etag) return { status: 304, headers: { etag, ...rate() } };
      return { ...ok(out), headers: { ...ok(out).headers, etag } };
    }
    if (method === 'POST' && rest_ === '/issues') return ok(rest(createIssue(body as { title: string })), 201);

    const m = rest_.match(/^\/issues\/(\d+)(\/.*)?$/);
    const cm = rest_.match(/^\/issues\/comments\/(\d+)$/);
    if (cm && method === 'PATCH') {
      for (const i of issues.values()) {
        const c = i.comments.find((x) => x.id === Number(cm[1]));
        if (c) {
          c.body = (body as { body: string }).body;
          Object.assign(c, { editor: login, edited_at: tick() });
          return ok({ id: c.id, body: c.body });
        }
      }
      return notFound;
    }
    if (!m) return notFound;
    const issue = issues.get(Number(m[1]));
    if (!issue) return notFound;
    const sub = m[2] ?? '';
    if (method === 'GET' && !sub) return ok(rest(issue));
    if (method === 'PATCH' && !sub) {
      const b = body as Partial<{ title: string; body: string; state: 'open' | 'closed'; state_reason: string }>;
      if (b.title !== undefined) issue.title = b.title;
      if (b.body !== undefined) {
        issue.body = b.body;
        Object.assign(issue, { editor: login, edited_at: tick() });
      }
      if (b.state) {
        issue.state = b.state;
        issue.state_reason = b.state === 'closed' ? (b.state_reason ?? 'completed') : null;
        issue.closed_at = b.state === 'closed' ? tick() : null;
      }
      issue.updated_at = tick();
      return ok(rest(issue));
    }
    if (method === 'POST' && sub === '/sub_issues') {
      const child = byId((body as { sub_issue_id: number }).sub_issue_id);
      if (!child) return { status: 422, body: { message: 'Validation Failed' } };
      issue.subIssues.push(child.number);
      issue.updated_at = tick();
      return ok(rest(issue), 201);
    }
    if (method === 'POST' && sub === '/dependencies/blocked_by') {
      const blocker = byId((body as { issue_id: number }).issue_id);
      if (!blocker) return { status: 422, body: { message: 'Validation Failed' } };
      if (!issue.blockedBy.includes(blocker.id)) issue.blockedBy.push(blocker.id);
      issue.updated_at = tick();
      return ok(rest(blocker), 201);
    }
    const dep = sub.match(/^\/dependencies\/blocked_by\/(\d+)$/);
    if (method === 'DELETE' && dep) {
      const blockerId = Number(dep[1]);
      if (!issue.blockedBy.includes(blockerId)) return notFound;
      issue.blockedBy = issue.blockedBy.filter((b) => b !== blockerId);
      issue.updated_at = tick();
      return ok(rest(issue));
    }
    if (method === 'POST' && sub === '/comments') {
      const c = { id: nextComment++, body: (body as { body: string }).body, created_at: tick(), user: login };
      issue.comments.push(c);
      issue.updated_at = c.created_at;
      return ok(
        {
          id: c.id,
          body: c.body,
          created_at: c.created_at,
          user: { login },
          html_url: `https://github.com/${repo}/issues/${issue.number}#issuecomment-${c.id}`,
        },
        201,
      );
    }
    if (method === 'POST' && sub === '/labels') {
      for (const l of (body as { labels: string[] }).labels) if (!issue.labels.includes(l)) issue.labels.push(l);
      issue.updated_at = tick();
      return ok(issue.labels.map((name) => ({ name })));
    }
    const dl = sub.match(/^\/labels\/(.+)$/);
    if (method === 'DELETE' && dl) {
      const name = decodeURIComponent(dl[1]);
      if (!issue.labels.includes(name)) return notFound;
      issue.labels = issue.labels.filter((l) => l !== name);
      issue.updated_at = tick();
      return ok(issue.labels.map((n) => ({ name: n })));
    }
    return notFound;
  }

  /** `GET /user/repos`, paged with a `Link` header like the live API. */
  function userRepos(url: URL): Res {
    const per = Number(url.searchParams.get('per_page') ?? 30);
    const page = Number(url.searchParams.get('page') ?? 1);
    const slice = allRepos.slice((page - 1) * per, page * per).map(repoJson);
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', ...rate() };
    if (page * per < allRepos.length) {
      const next = new URL(url);
      next.searchParams.set('page', String(page + 1));
      headers.link = `<${next}>; rel="next"`;
    }
    return { status: 200, headers, body: slice };
  }

  const fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const headers = new Headers(init.headers);
    const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
    const r = handle(init.method ?? 'GET', url, headers, body);
    return new Response(r.status === 304 || r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: r.headers,
    });
  };

  return {
    repo,
    issues,
    fetch: fetch as typeof globalThis.fetch,
    handle,
    /** Logins whose repo permission the adapter asked about, in order. */
    permissionChecks,
    /** What a teammate does in the GitHub UI. */
    human: {
      close(number: number, reason: 'completed' | 'not_planned' = 'completed') {
        const i = issues.get(number)!;
        Object.assign(i, { state: 'closed', state_reason: reason, closed_at: tick() });
        i.updated_at = tick();
      },
      comment(number: number, user: string, body: string) {
        const i = issues.get(number)!;
        i.comments.push({ id: nextComment++, body, created_at: tick(), user });
        i.updated_at = tick();
      },
      /** Someone edits an issue body in the GitHub UI (its author, or a person with write access). */
      editBody(number: number, user: string, body: string) {
        const i = issues.get(number)!;
        Object.assign(i, { body, editor: user, edited_at: tick(), updated_at: tick() });
      },
      /** Someone with write access edits another person's comment; `null`: an account since deleted. */
      editComment(commentId: number, user: string | null, body: string) {
        for (const i of issues.values()) {
          const c = i.comments.find((x) => x.id === commentId);
          if (c) Object.assign(c, { body, editor: user, edited_at: tick() });
          if (c) i.updated_at = tick();
        }
      },
      createSubIssue(parent: number, title: string, labelNames: string[] = [], author?: string) {
        const i = createIssue({ title, body: '', labels: labelNames, author });
        issues.get(parent)!.subIssues.push(i.number);
        issues.get(parent)!.updated_at = tick();
        return i;
      },
      seed: createIssue,
    },
  };
}
