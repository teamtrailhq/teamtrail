import { ACTIONS, VIEWS, clip, label, md, plain, type Block } from './kit';

export type SaveMode = 'resolve' | 'trail' | 'new';

export interface DecisionForm {
  trails: { id: string; label: string }[];
  mapId?: string;
  tickets: { id: string; label: string }[];
  ticketId?: string;
  mode: SaveMode;
  decision: string;
  summary: string;
  thread?: { channel?: string; count: number; participants: string[]; permalink?: string };
  postsTo?: string;
  notice?: string;
}

const option = (o: { id: string; label: string }) => ({ text: plain(clip(o.label, 75)), value: o.id });

export function loadingModal(meta: string) {
  return {
    type: 'modal',
    callback_id: VIEWS.decision,
    private_metadata: meta,
    title: plain('Save as decision'),
    close: plain('Cancel'),
    blocks: [{ type: 'section', text: md('_Reading the thread…_') }],
  };
}

export function noticeModal(meta: string, text: string) {
  return {
    type: 'modal',
    callback_id: VIEWS.decision,
    private_metadata: meta,
    title: plain('Save as decision'),
    close: plain('Close'),
    blocks: [{ type: 'section', text: md(text) }],
  };
}

export function decisionModal(f: DecisionForm, meta: string) {
  const blocks: Block[] = [];
  if (f.notice) blocks.push({ type: 'context', elements: [md(f.notice)] });
  const trail = f.trails.find((m) => m.id === f.mapId);
  blocks.push({
    type: 'section',
    block_id: 'trail',
    text: md('*Trail*'),
    accessory: {
      type: 'static_select',
      action_id: ACTIONS.trailPick,
      options: f.trails.slice(0, 100).map(option),
      ...(trail ? { initial_option: option(trail) } : {}),
    },
  });
  const modes: { v: SaveMode; label: string }[] = [
    ...(f.tickets.length ? [{ v: 'resolve' as const, label: 'Resolve ticket' }] : []),
    { v: 'trail', label: 'Trail only' },
    { v: 'new', label: 'New decision ticket' },
  ];
  const mode = modes.find((m) => m.v === f.mode) ?? modes[0];
  const radio = (m: (typeof modes)[number]) => ({ text: plain(m.label), value: m.v });
  blocks.push({
    type: 'input',
    block_id: 'mode',
    label: plain('Save as'),
    element: { type: 'radio_buttons', action_id: 'value', options: modes.map(radio), initial_option: radio(mode) },
  });
  if (f.tickets.length) {
    const t = f.tickets.find((x) => x.id === f.ticketId);
    blocks.push({
      type: 'input',
      block_id: 'ticket',
      optional: true,
      label: plain('Ticket to resolve'),
      element: {
        type: 'static_select',
        action_id: 'value',
        options: f.tickets.slice(0, 100).map(option),
        ...(t ? { initial_option: option(t) } : {}),
      },
    });
  }
  blocks.push({
    type: 'input',
    block_id: 'decision',
    label: plain('Decision'),
    element: {
      type: 'plain_text_input',
      action_id: 'value',
      multiline: true,
      max_length: 3000,
      ...(f.decision ? { initial_value: clip(f.decision, 3000) } : {}),
    },
  });
  blocks.push({
    type: 'input',
    block_id: 'summary',
    optional: true,
    label: plain('Summary'),
    element: {
      type: 'plain_text_input',
      action_id: 'value',
      multiline: true,
      max_length: 3000,
      ...(f.summary ? { initial_value: clip(f.summary, 3000) } : {}),
    },
  });
  const th = f.thread;
  const facts = [
    th &&
      [
        th.channel ? `#${label(th.channel)}` : undefined,
        th.count ? `${th.count} msg${th.count === 1 ? '' : 's'}` : undefined,
        th.participants.length ? th.participants.map((p) => `@${label(p)}`).join(' ') : undefined,
        th.permalink ? `<${th.permalink}|thread>` : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
    f.postsTo && `Posts to ${label(f.postsTo)}`,
  ].filter(Boolean) as string[];
  if (facts.length) blocks.push({ type: 'context', elements: facts.map(md) });
  return {
    type: 'modal',
    callback_id: VIEWS.decision,
    private_metadata: meta,
    title: plain('Save as decision'),
    submit: plain('Save'),
    close: plain('Cancel'),
    blocks,
  };
}
