const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The Socket Mode address `apps.connections.open` answered, or an error when it isn't Slack's: everything people
 * do in Slack arrives over this socket and is trusted as coming from Slack, so it has to be `wss://` on the host
 * the Web API is on (slack.com) or below it. A fake Slack on this machine ($TEAMTRAIL_SLACK_API on localhost) may
 * answer a loopback address, with or without TLS; nothing else may.
 */
export function socketUrl(url: unknown, apiUrl = 'https://slack.com/api'): string {
  let socket: URL;
  let api: URL;
  try {
    socket = new URL(String(url));
    api = new URL(apiUrl);
  } catch {
    throw new Error('Slack answered a Socket Mode address that is not a URL');
  }
  const secure = socket.protocol === 'wss:';
  const local = LOOPBACK.has(api.hostname) && LOOPBACK.has(socket.hostname) && (secure || socket.protocol === 'ws:');
  const slack = secure && (socket.hostname === api.hostname || socket.hostname.endsWith(`.${api.hostname}`));
  if (!local && !slack) throw new Error('Slack answered a Socket Mode address that is not on Slack; not connecting');
  return socket.toString();
}
