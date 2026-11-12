/** Every limit the service enforces, in one place. */
export const LIMITS = {
  /** Slack's request bodies are small; anything bigger is refused unread. */
  httpBodyBytes: 256 * 1024,
  /** One socket message: a Home tab or a modal with 100 blocks fits well within this. */
  socketMessageBytes: 512 * 1024,
  /** Slack allows 3 s for an ack; the rest is the round trip. */
  ackMs: 2500,
  /** A socket that doesn't say hello with a valid link token in this time is closed. */
  helloMs: 5000,
  pingMs: 30_000,
  /** OAuth state, from /install to the callback. */
  installMs: 10 * 60_000,
  /** The code handed to the Lookout after the callback. */
  codeMs: 60_000,
  linksPerUser: 5,
  socketsPerLink: 2,
  /** Slack API calls per link: a burst, then this many per minute. */
  callBurst: 30,
  callsPerMinute: 120,
  /** /install and /link per client address. */
  httpBurst: 20,
  httpPerMinute: 30,
  /** Slack event ids remembered to drop retries. */
  recentEvents: 5000,
  purgeMs: 10 * 60_000,
} as const;
