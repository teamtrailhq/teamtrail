import { BOT_SCOPES, OPTIONAL_SCOPES } from '../../src/manifest';

/**
 * In-memory stand-in for the slice of the Slack Web API the connector uses.
 * Response shapes and error codes follow api.slack.com/methods, trimmed to the
 * fields read. Also builds the Socket Mode payloads Slack would send for the
 * user's clicks, so flows read like what happens in the Slack client.
 */

export interface FakeMessage {
  ts: string;
  user?: string;
  bot_id?: string;
  text: string;
  thread_ts?: string;
  blocks?: Record<string, unknown>[];
  /** Earlier block versions: a client that has not refreshed yet can still click them. */
  history?: Record<string, unknown>[][];
}

interface FakeChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_im?: boolean;
  members: Set<string>;
  messages: FakeMessage[];
}

interface FakeView {
  id: string;
  hash: string;
  user: string;
  view: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Res = { status: number; headers?: Record<string, string>; body?: unknown };

export function fakeSlack(opts: { start?: number } = {}) {
  const team = { id: 'T0EFIKA01', name: 'efika', domain: 'efika', url: 'https://efika.slack.com/' };
  const app = { id: 'A0Scout0001', botId: 'B0Scout0001', botUser: 'U0ScoutBOT' };
  const tokens = {
    app: `xapp-1-${app.id}-1001-6d696c6f6170706c6576656c`,
    bot: 'xoxb-1001-2002-fakebottokenscout',
    user: 'xoxp-1001-2002-fakeusertoken',
  };
  const state = {
    scopes: [...BOT_SCOPES, ...OPTIONAL_SCOPES] as string[],
    socketMode: true,
    installed: true,
    /** A test's way to make one call fail: return an error code for it. */
    reject: undefined as ((method: string, args: Record<string, unknown>) => string | undefined) | undefined,
  };
  let clock = Math.floor((opts.start ?? Date.UTC(2026, 9, 31, 12, 0, 0)) / 1000);
  let seq = 0;
  let viewSeq = 0;
  let triggerSeq = 0;
  let responseSeq = 0;
  let ticket = 0;
  const ts = () => `${clock++}.${String(++seq).padStart(6, '0')}`;

  const users = new Map(
    [
      { id: 'U0ANA0001', name: 'ana', real_name: 'Ana Silva', display_name: 'ana', email: 'ana@efika.test' },
      { id: 'U0RAJ0001', name: 'raj', real_name: 'Raj Patel', display_name: 'raj', email: 'raj@efika.test' },
      { id: 'U0EVE0001', name: 'eve', real_name: 'Eve Moreau', display_name: '' },
      { id: app.botUser, name: 'scout', real_name: 'Scout', display_name: 'Scout', is_bot: true },
      { id: 'USLACKBOT', name: 'slackbot', real_name: 'Slackbot', display_name: 'Slackbot' },
    ].map((u) => [u.id, u]),
  );
  const channels = new Map<string, FakeChannel>();
  const addChannel = (id: string, name: string, is_private: boolean, botIn: boolean) =>
    channels.set(id, {
      id,
      name,
      is_private,
      members: new Set(['U0ANA0001', 'U0RAJ0001', ...(botIn ? [app.botUser] : [])]),
      messages: [],
    });
  addChannel('C0INFRA01', 'infra', false, true);
  addChannel('G0ScoutTST', 'scout-test', true, true);
  addChannel('C0RANDOM1', 'random', false, false);
  const im = (user: string) => {
    const id = `D0${user.slice(1, 9)}`;
    if (!channels.has(id))
      channels.set(id, {
        id,
        name: id,
        is_private: true,
        is_im: true,
        members: new Set([user, app.botUser]),
        messages: [],
      });
    return id;
  };
  const views = new Map<string, FakeView>();
  const triggers = new Map<string, string>();
  /** Bodies POSTed to response_url, i.e. ephemeral replies. */
  const responses: { url: string; body: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

  const userJson = (u: ReturnType<typeof users.get> & {}) => ({
    id: u.id,
    team_id: team.id,
    name: u.name,
    deleted: false,
    real_name: u.real_name,
    is_bot: !!u.is_bot,
    profile: { display_name: u.display_name, real_name: u.real_name },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function api(method: string, token: string, args: Record<string, any>): Res {
    const err = (error: string, extra: Record<string, unknown> = {}): Res => ({
      status: 200,
      body: { ok: false, error, ...extra },
    });
    const ok = (b: Record<string, unknown> = {}): Res => ({
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...(token === tokens.bot ? { 'x-oauth-scopes': state.scopes.join(',') } : {}),
      },
      body: { ok: true, ...b },
    });
    if (method === 'apps.connections.open') {
      if (token === tokens.bot || token === tokens.user) return err('not_allowed_token_type');
      if (token !== tokens.app) return err('invalid_auth');
      return ok({ url: `wss://wss-primary.slack.test/link/?ticket=${++ticket}&app_id=${app.id}` });
    }
    if (token === tokens.app) return err('not_allowed_token_type');
    if (token !== tokens.bot || !state.installed) return err('invalid_auth');
    const rejected = state.reject?.(method, args);
    if (rejected) return err(rejected);
    const tooLong = /^(chat\.(postMessage|update)|views\.(open|update|publish))$/.test(method)
      ? overLimit(args.blocks ?? args.view?.blocks)
      : undefined;
    if (tooLong) return err('invalid_blocks', { errors: [tooLong] });
    const channel = (id: string) => channels.get(id);
    switch (method) {
      case 'auth.test':
        return ok({
          url: team.url,
          team: team.name,
          user: 'scout',
          team_id: team.id,
          user_id: app.botUser,
          bot_id: app.botId,
          is_enterprise_install: false,
        });
      case 'bots.info':
        return args.bot === app.botId
          ? ok({ bot: { id: app.botId, deleted: false, name: 'Scout', app_id: app.id, user_id: app.botUser } })
          : err('bot_not_found');
      case 'users.info': {
        const u = users.get(args.user);
        return u ? ok({ user: userJson(u) }) : err('user_not_found');
      }
      case 'users.lookupByEmail': {
        if (!state.scopes.includes('users:read.email'))
          return err('missing_scope', { needed: 'users:read.email', provided: state.scopes.join(',') });
        const u = [...users.values()].find((x) => 'email' in x && x.email === String(args.email).toLowerCase());
        return u
          ? ok({ user: { ...userJson(u), profile: { ...userJson(u).profile, email: u.email } } })
          : err('users_not_found');
      }
      case 'users.list':
        return ok({ members: [...users.values()].map(userJson), response_metadata: { next_cursor: '' } });
      case 'conversations.open': {
        if (!users.has(args.users)) return err('user_not_found');
        return ok({ channel: { id: im(args.users) } });
      }
      case 'conversations.replies': {
        const c = channel(args.channel);
        if (!c) return err('channel_not_found');
        if (!c.members.has(app.botUser)) return err('not_in_channel');
        const root = c.messages.find((m) => m.ts === args.ts);
        if (!root) return err('thread_not_found');
        const thread = [root, ...c.messages.filter((m) => m.thread_ts === args.ts && m.ts !== args.ts)].slice(
          0,
          Number(args.limit ?? 1000),
        );
        return ok({
          messages: thread.map((m) => ({
            type: 'message',
            ts: m.ts,
            ...(m.user ? { user: m.user } : {}),
            ...(m.bot_id ? { bot_id: m.bot_id } : {}),
            text: m.text,
            ...(m.thread_ts ? { thread_ts: m.thread_ts } : {}),
          })),
          has_more: false,
        });
      }
      case 'chat.getPermalink': {
        const c = channel(args.channel);
        if (!c) return err('channel_not_found');
        return ok({
          channel: c.id,
          permalink: `${team.url}archives/${c.id}/p${String(args.message_ts).replace('.', '')}`,
        });
      }
      case 'chat.postMessage': {
        let c = channel(args.channel);
        if (!c && users.has(args.channel)) c = channel(im(args.channel));
        if (!c) return err('channel_not_found');
        if (!c.members.has(app.botUser)) return err('not_in_channel');
        const m: FakeMessage = {
          ts: ts(),
          bot_id: app.botId,
          text: args.text,
          ...(args.thread_ts ? { thread_ts: args.thread_ts } : {}),
          ...(args.blocks ? { blocks: args.blocks } : {}),
        };
        c.messages.push(m);
        return ok({ channel: c.id, ts: m.ts, message: { type: 'message', bot_id: app.botId, text: m.text, ts: m.ts } });
      }
      case 'chat.update': {
        const m = channel(args.channel)?.messages.find((x) => x.ts === args.ts);
        if (!m) return err('message_not_found');
        if (m.blocks) (m.history ??= []).push(m.blocks);
        m.text = args.text;
        m.blocks = args.blocks;
        return ok({ channel: args.channel, ts: m.ts, text: m.text });
      }
      case 'views.open': {
        const user = triggers.get(args.trigger_id);
        if (!user) return err('expired_trigger_id');
        triggers.delete(args.trigger_id);
        const v: FakeView = {
          id: `V0${String(++viewSeq).padStart(8, '0')}`,
          hash: `${clock}.h${viewSeq}`,
          user,
          view: args.view,
        };
        views.set(v.id, v);
        return ok({ view: { id: v.id, hash: v.hash, ...args.view } });
      }
      case 'views.update': {
        const v = views.get(args.view_id);
        if (!v) return err('not_found');
        if (args.hash && args.hash !== v.hash) return err('hash_conflict');
        v.view = args.view;
        v.hash = `${clock}.h${++viewSeq}`;
        return ok({ view: { id: v.id, hash: v.hash, ...args.view } });
      }
      case 'views.publish':
        if (!users.has(args.user_id)) return err('user_not_found');
        return ok({ view: { id: `VH${args.user_id}`, ...args.view } });
      default:
        return err('unknown_method');
    }
  }

  /** Slack's Block Kit limits: a text object holds at most 3000 characters, a button label 75. */
  function overLimit(blocks: unknown, at = 'blocks'): string | undefined {
    if (Array.isArray(blocks)) {
      for (let i = 0; i < blocks.length; i++) {
        const found = overLimit(blocks[i], `${at}[${i}]`);
        if (found) return found;
      }
      return undefined;
    }
    if (!blocks || typeof blocks !== 'object') return undefined;
    const o = blocks as Record<string, unknown>;
    if ((o.type === 'mrkdwn' || o.type === 'plain_text') && String(o.text).length > 3000)
      return `must be less than 3001 characters [json-pointer:/${at}/text]`;
    if (o.type === 'button' && String((o.text as { text?: string })?.text ?? '').length > 75)
      return `must be less than 76 characters [json-pointer:/${at}/text]`;
    for (const [k, v] of Object.entries(o)) {
      const found = overLimit(v, `${at}/${k}`);
      if (found) return found;
    }
    return undefined;
  }

  const fetchFn = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.hostname === 'hooks.slack.test') {
      responses.push({ url: url.pathname, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const method = url.pathname.replace(/^.*\/api\//, '');
    const auth = new Headers(init.headers).get('authorization') ?? '';
    const args = init.body ? JSON.parse(String(init.body)) : Object.fromEntries(url.searchParams);
    const r = api(method, auth.replace(/^Bearer /, ''), args);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers });
  };

  const trigger = (user: string) => {
    const id = `${clock}.${++triggerSeq}.fake${triggerSeq}`;
    triggers.set(id, user);
    return id;
  };
  const responseUrl = () => `https://hooks.slack.test/actions/${team.id}/${++responseSeq}/fakeresponse${responseSeq}`;
  const userRef = (id: string) => ({ id, username: users.get(id)?.name, name: users.get(id)?.name, team_id: team.id });

  /** Values Slack would report for a view: initial values, overridden by what the user typed or picked. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function stateOf(view: Record<string, any>, input: Record<string, string>) {
    const values: Record<string, Record<string, unknown>> = {};
    for (const b of view.blocks ?? []) {
      const el = b.type === 'input' ? b.element : b.type === 'section' ? b.accessory : undefined;
      if (!el?.action_id || !b.block_id) continue;
      const given = input[b.block_id];
      const pick = (v?: string) =>
        v === undefined
          ? (el.initial_option ?? null)
          : (el.options.find((o: { value: string }) => o.value === v) ?? null);
      values[b.block_id] = {
        [el.action_id]:
          el.type === 'plain_text_input'
            ? { type: el.type, value: given ?? el.initial_value ?? null }
            : { type: el.type, selected_option: pick(given) },
      };
    }
    return { values };
  }

  return {
    team,
    app,
    tokens,
    state,
    users,
    channels,
    views,
    responses,
    fetch: fetchFn as typeof fetch,
    im,
    /** What people do in the Slack client. */
    human: {
      post(channel: string, user: string, text: string, thread_ts?: string) {
        const m: FakeMessage = { ts: ts(), user, text, ...(thread_ts ? { thread_ts } : {}) };
        channels.get(channel)!.messages.push(m);
        return m.ts;
      },
    },
    /** Socket Mode payloads for user actions. */
    payload: {
      homeOpened: (user: string, tab = 'home') => ({
        type: 'events_api' as const,
        payload: {
          token: 'legacy',
          team_id: team.id,
          api_app_id: app.id,
          type: 'event_callback',
          event_id: `Ev0${++seq}`,
          event_time: clock,
          event: { type: 'app_home_opened', user, channel: im(user), tab, event_ts: ts() },
        },
      }),
      command: (user: string, channel: string, text: string, command = '/scout') => ({
        type: 'slash_commands' as const,
        payload: {
          token: 'legacy',
          team_id: team.id,
          team_domain: team.domain,
          channel_id: channel,
          channel_name: channels.get(channel)?.name ?? 'directmessage',
          user_id: user,
          user_name: users.get(user)?.name,
          command,
          text,
          api_app_id: app.id,
          is_enterprise_install: 'false',
          response_url: responseUrl(),
          trigger_id: trigger(user),
        },
      }),
      shortcut: (user: string, channel: string, messageTs: string) => {
        const c = channels.get(channel)!;
        const m = c.messages.find((x) => x.ts === messageTs)!;
        return {
          type: 'interactive' as const,
          payload: {
            type: 'message_action',
            token: 'legacy',
            action_ts: `${clock}.000001`,
            team: { id: team.id, domain: team.domain },
            user: userRef(user),
            channel: { id: c.id, name: c.is_private ? c.name : c.name },
            is_enterprise_install: false,
            callback_id: 'save_decision',
            trigger_id: trigger(user),
            response_url: responseUrl(),
            message_ts: m.ts,
            message: {
              type: 'message',
              ts: m.ts,
              user: m.user,
              text: m.text,
              ...(m.thread_ts ? { thread_ts: m.thread_ts } : {}),
            },
          },
        };
      },
      /** Click a button in a posted message, by action_id (or prefix). */
      click: (user: string, channel: string, messageTs: string, actionId: string) => {
        const m = channels.get(channel)!.messages.find((x) => x.ts === messageTs)!;
        const block = [m.blocks ?? [], ...[...(m.history ?? [])].reverse()]
          .flat()
          .find((b) => (b.elements as { action_id: string }[] | undefined)?.some((e) => e.action_id === actionId));
        const el = (block!.elements as Record<string, unknown>[]).find((e) => e.action_id === actionId)!;
        return {
          type: 'interactive' as const,
          payload: {
            type: 'block_actions',
            user: userRef(user),
            api_app_id: app.id,
            token: 'legacy',
            container: { type: 'message', message_ts: m.ts, channel_id: channel, is_ephemeral: false },
            trigger_id: trigger(user),
            team: { id: team.id, domain: team.domain },
            channel: { id: channel, name: channels.get(channel)!.name },
            message: { type: 'message', ts: m.ts, text: m.text },
            response_url: responseUrl(),
            actions: [
              {
                type: 'button',
                action_id: el.action_id,
                block_id: block!.block_id,
                text: el.text,
                value: el.value,
                action_ts: `${clock}.000002`,
              },
            ],
          },
        };
      },
      clickHome: (user: string, actionId: string) => ({
        type: 'interactive' as const,
        payload: {
          type: 'block_actions',
          user: userRef(user),
          api_app_id: app.id,
          token: 'legacy',
          container: { type: 'view', view_id: `VH${user}` },
          trigger_id: trigger(user),
          team: { id: team.id, domain: team.domain },
          view: { id: `VH${user}`, type: 'home' },
          actions: [{ type: 'button', action_id: actionId, block_id: 'home', action_ts: `${clock}.000003` }],
        },
      }),
      /** Pick an option in a modal's section accessory (dispatches block_actions with the view). */
      pick: (user: string, viewId: string, actionId: string, value: string) => {
        const v = views.get(viewId)!;
        const block = v.view.blocks.find((b: Record<string, any>) => b.accessory?.action_id === actionId); // eslint-disable-line @typescript-eslint/no-explicit-any
        const option = block.accessory.options.find((o: { value: string }) => o.value === value);
        return {
          type: 'interactive' as const,
          payload: {
            type: 'block_actions',
            user: userRef(user),
            api_app_id: app.id,
            token: 'legacy',
            container: { type: 'view', view_id: v.id },
            trigger_id: trigger(user),
            team: { id: team.id, domain: team.domain },
            view: {
              id: v.id,
              hash: v.hash,
              callback_id: v.view.callback_id,
              private_metadata: v.view.private_metadata,
              state: stateOf(v.view, { [block.block_id]: value }),
            },
            actions: [
              {
                type: 'static_select',
                action_id: actionId,
                block_id: block.block_id,
                selected_option: option,
                action_ts: `${clock}.000004`,
              },
            ],
          },
        };
      },
      submit: (user: string, viewId: string, input: Record<string, string> = {}) => {
        const v = views.get(viewId)!;
        return {
          type: 'interactive' as const,
          payload: {
            type: 'view_submission',
            team: { id: team.id, domain: team.domain },
            user: userRef(user),
            api_app_id: app.id,
            token: 'legacy',
            trigger_id: trigger(user),
            view: {
              id: v.id,
              hash: v.hash,
              type: 'modal',
              callback_id: v.view.callback_id,
              private_metadata: v.view.private_metadata,
              state: stateOf(v.view, input),
            },
            response_urls: [],
          },
        };
      },
    },
  };
}
export type FakeSlack = ReturnType<typeof fakeSlack>;
