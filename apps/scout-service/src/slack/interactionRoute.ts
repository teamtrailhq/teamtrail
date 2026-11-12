import { LINK_METADATA_TYPE } from '../hub/allowedCall';

/**
 * Who an interaction may go to. Every link in a workspace shares one bot, so a Scout message or modal proves
 * nothing by itself; the route names what the service must have on record:
 * - `message`: a click on a message goes only to the link the service recorded as its poster;
 * - `view`: a click in a modal or Home tab, or a submission, goes only to the acting user's link that opened it;
 * - `user`: a shortcut or slash command goes to the acting user's own links;
 * - `none`: nothing on record can be trusted (an ephemeral message, an unknown kind): dropped.
 */
export type Route =
  | { by: 'user' }
  | { by: 'message'; channel: string; ts: string; stamp?: string }
  | { by: 'view'; viewId: string }
  | { by: 'none' };

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** The link stamped in the clicked message's metadata, if Slack includes it; it must agree with the record. */
function stampOf(payload: Obj) {
  const metadata = obj(obj(payload.message).metadata);
  if (metadata.event_type !== LINK_METADATA_TYPE) return undefined;
  return str(obj(metadata.event_payload).link);
}

function viewRoute(payload: Obj, container: Obj): Route {
  const viewId = str(obj(payload.view).id) ?? str(container.view_id);
  return viewId ? { by: 'view', viewId } : { by: 'none' };
}

function blockActions(payload: Obj): Route {
  const container = obj(payload.container);
  if (container.type === 'view') return viewRoute(payload, container);
  if (container.type !== 'message' || container.is_ephemeral === true) return { by: 'none' };
  const channel = str(container.channel_id) ?? str(obj(payload.channel).id);
  const ts = str(container.message_ts) ?? str(obj(payload.message).ts);
  if (!channel || !ts) return { by: 'none' };
  return { by: 'message', channel, ts, stamp: stampOf(payload) };
}

/** The route of an interaction payload, by its type. */
export function interactionRoute(payload: Obj): Route {
  switch (payload.type) {
    case 'block_actions':
      return blockActions(payload);
    case 'view_submission':
    case 'view_closed':
      return viewRoute(payload, {});
    case 'message_action':
    case 'shortcut':
      return { by: 'user' };
    default:
      return { by: 'none' };
  }
}
