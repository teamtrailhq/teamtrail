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
  /**
   * The code handed to the Lookout after the callback: long enough for the trail lead to read "Connect as @user in
   * <workspace>?" and choose Connect, short enough that a code seen later is useless.
   */
  codeMs: 3 * 60_000,
  /**
   * "Not connected" or "offline" for a mention or DM, per person: a few at once, so trying again is answered too,
   * then one every ten seconds, however fast they keep writing.
   */
  offlineReplyBurst: 3,
  offlineRepliesPerMinute: 6,
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
  /** The hello frame: a link token and little else. */
  helloBytes: 4096,
  /** Messages per socket after the hello (acks and calls together); past it the socket closes `too-fast`. */
  socketBurst: 100,
  socketPerMinute: 600,
  /** Sockets that haven't said hello yet: in all, and per client address (/64 for IPv6). */
  pendingSockets: 200,
  pendingPerAddress: 10,
  /** WebSocket upgrades per client address. */
  upgradeBurst: 20,
  upgradePerMinute: 30,
  /** Commands and clicks are dropped when their signature was seen within Slack's five-minute window. */
  replayMs: 5 * 60_000,
  replayEntries: 50_000,
  /** How long a link owns what it made: posts (chat.update, clicks), views, the owner's DM, a shortcut's thread. */
  messageMs: 30 * 24 * 60 * 60_000,
  viewMs: 7 * 24 * 60 * 60_000,
  dmMs: 365 * 24 * 60 * 60_000,
  threadMs: 10 * 60_000,
  /** Whether the owner is in a channel, cached briefly; members read in pages of 1000, at most this many. */
  memberCacheMs: 2 * 60_000,
  memberPages: 20,
} as const;
