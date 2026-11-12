/** Slack request bodies, as Slack sends them to the three request URLs. */

type Who = { team: string; user: string };

const form = (payload: unknown) => new URLSearchParams({ payload: JSON.stringify(payload) }).toString();

export const command = (o: Who & { text?: string; responseUrl?: string }) =>
  new URLSearchParams({
    command: '/scout',
    text: o.text ?? 'inbox',
    team_id: o.team,
    user_id: o.user,
    channel_id: 'C1',
    response_url: o.responseUrl ?? 'https://hooks.example/x',
  }).toString();

/** A button click on a message: the channel and ts identify it; `stamp` is the link in its metadata, if any. */
export const clickOnMessage = (
  o: Who & { channel: string; ts: string; stamp?: string; responseUrl?: string; ephemeral?: boolean },
) =>
  form({
    type: 'block_actions',
    team: { id: o.team },
    user: { id: o.user },
    container: { type: 'message', channel_id: o.channel, message_ts: o.ts, is_ephemeral: o.ephemeral ?? false },
    channel: { id: o.channel },
    response_url: o.responseUrl,
    message: {
      ts: o.ts,
      ...(o.stamp ? { metadata: { event_type: 'scout_link', event_payload: { link: o.stamp } } } : {}),
    },
    actions: [{ action_id: 'approve', value: '{"m":"x","t":"1"}' }],
  });

/** A click inside a modal or the Home tab. */
export const clickInView = (o: Who & { viewId: string }) =>
  form({
    type: 'block_actions',
    team: { id: o.team },
    user: { id: o.user },
    container: { type: 'view', view_id: o.viewId },
    view: { id: o.viewId, type: 'modal' },
    trigger_id: 'trigger-1',
    actions: [{ action_id: 'pick' }],
  });

export const submission = (o: Who & { viewId: string }) =>
  form({ type: 'view_submission', team: { id: o.team }, user: { id: o.user }, view: { id: o.viewId, state: {} } });

/** "Save as decision" on a message. */
export const messageAction = (o: Who & { channel: string; ts: string; threadTs?: string; stamp?: string }) =>
  form({
    type: 'message_action',
    callback_id: 'save_decision',
    team: { id: o.team },
    user: { id: o.user },
    channel: { id: o.channel },
    trigger_id: 'trigger-2',
    message: {
      ts: o.ts,
      thread_ts: o.threadTs,
      text: 'words someone else wrote',
      ...(o.stamp ? { metadata: { event_type: 'scout_link', event_payload: { link: o.stamp } } } : {}),
    },
  });

export const event = (o: Who & { id: string; type?: string }) =>
  JSON.stringify({
    type: 'event_callback',
    team_id: o.team,
    event_id: o.id,
    event: { type: o.type ?? 'app_home_opened', user: o.user, tab: 'home' },
  });
