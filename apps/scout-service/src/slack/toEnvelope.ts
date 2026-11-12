import { randomUUID } from 'node:crypto';
import type { Envelope } from '@teamtrail/connector-slack/node';
import { interactionRoute, type Route } from './interactionRoute';

/** The three request URLs Slack calls. */
export type SlackPath = 'events' | 'interactions' | 'commands';

/** What a verified Slack request asks of the service. */
export type SlackRequest =
  | { kind: 'challenge'; challenge: string }
  | { kind: 'uninstall'; teamId: string }
  | { kind: 'deliver'; envelope: Envelope; teamId: string; userId: string; route: Route; eventId?: string }
  | { kind: 'ignore' };

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

const envelope = (type: Envelope['type'], payload: Obj): Envelope => ({
  envelope_id: randomUUID(),
  type,
  payload,
  accepts_response_payload: type !== 'events_api',
});

/** `tokens_revoked` for the bot token (the app has no user tokens, but only the bot's counts). */
const botTokenRevoked = (event: Obj) =>
  event.type === 'tokens_revoked' &&
  Array.isArray(obj(event.tokens).bot) &&
  (obj(event.tokens).bot as unknown[]).length > 0;

function fromEvent(body: Obj): SlackRequest {
  if (body.type === 'url_verification') return { kind: 'challenge', challenge: String(body.challenge ?? '') };
  if (body.type !== 'event_callback') return { kind: 'ignore' };
  const event = obj(body.event);
  const teamId = str(body.team_id);
  if (!teamId) return { kind: 'ignore' };
  if (event.type === 'app_uninstalled' || botTokenRevoked(event)) return { kind: 'uninstall', teamId };
  if (event.type === 'tokens_revoked') return { kind: 'ignore' };
  const userId = str(event.user);
  if (!userId) return { kind: 'ignore' };
  return {
    kind: 'deliver',
    envelope: envelope('events_api', body),
    teamId,
    userId,
    route: { by: 'user' },
    eventId: str(body.event_id),
  };
}

function fromCommand(form: URLSearchParams): SlackRequest {
  const payload = Object.fromEntries(form);
  const teamId = str(payload.team_id);
  const userId = str(payload.user_id);
  if (!teamId || !userId) return { kind: 'ignore' };
  return { kind: 'deliver', envelope: envelope('slash_commands', payload), teamId, userId, route: { by: 'user' } };
}

function fromInteraction(form: URLSearchParams): SlackRequest {
  let payload: Obj;
  try {
    payload = obj(JSON.parse(form.get('payload') ?? ''));
  } catch {
    return { kind: 'ignore' };
  }
  const teamId = str(obj(payload.team).id);
  const userId = str(obj(payload.user).id);
  if (!teamId || !userId) return { kind: 'ignore' };
  return {
    kind: 'deliver',
    envelope: envelope('interactive', payload),
    teamId,
    userId,
    route: interactionRoute(payload),
  };
}

/** Turns a verified Slack request into what to do with it, in the shape Socket Mode delivers. */
export function toEnvelope(path: SlackPath, body: string): SlackRequest {
  switch (path) {
    case 'events': {
      try {
        return fromEvent(obj(JSON.parse(body)));
      } catch {
        return { kind: 'ignore' };
      }
    }
    case 'commands':
      return fromCommand(new URLSearchParams(body));
    case 'interactions':
      return fromInteraction(new URLSearchParams(body));
    default: {
      const never: never = path;
      return never;
    }
  }
}
