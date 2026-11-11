/**
 * Text a guide must never carry: it would steer the agent around Teamtrail's rules or the human. Each rule is checked
 * on every line of the file (frontmatter included, since checklist items are read by the agent too) and, unless
 * `perLine`, over the whole text normalised (textLint.ts), so splitting a sentence over two lines or spelling it in
 * full-width letters doesn't hide it. `squashed` rules also run with spaces, quotes and backticks taken out, so
 * "verification .json" is still the file. A pattern list can only find what it knows: the human still reads the guide.
 */
export interface TextRule {
  rule: string;
  re: RegExp;
  message: string;
  level: 'error' | 'warn';
  perLine?: boolean;
  squashed?: boolean;
}

/** Files and folders only the trail lead changes, or that hold this machine's trust. */
const PROTECTED = [
  'verification\\.json',
  'guides\\.lock\\.json',
  'guides\\.json',
  'guides-approved\\.json',
  'policy\\.json',
  'attention\\.json',
  'workspaces\\.json',
  'models\\.json',
  'trackers\\.json',
  'approvals\\.json',
  'credentials\\.json',
  'projects\\.json',
  'remote-tokens',
  'machine\\.key',
  '(^|[^\\w.])\\.teamtrail\\b',
  'dot-?teamtrail',
  "teamtrail('s)?[ -]?(folder|directory|dir|config)",
  '(^|[^\\w])\\.agents/',
  '\\.config/teamtrail',
  'teamtrail_config_dir',
].join('|');

/** Files that hold secrets on a developer's machine. */
const SECRET_FILES =
  '\\.env\\b|\\.config/gh\\b|hosts\\.yml|\\.gnupg|id_(rsa|ed25519|ecdsa)|\\.ssh/|\\.npmrc|\\.netrc|\\.pypirc|\\.aws/|\\.docker/config|\\.kube/config|\\.git-credentials';

export const TEXT_RULES: TextRule[] = [
  {
    rule: 'override',
    re: /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|system|teamtrail|other)\b[^.\n]{0,25}\b(instructions?|rules?|prompts?|guidance)\b/i,
    message: 'tries to override earlier instructions',
    level: 'error',
  },
  {
    rule: 'override',
    re: /\b(you are no longer|new system prompt|system prompt\s*:|developer mode|jailbreak)/i,
    message: "tries to replace the agent's instructions",
    level: 'error',
  },
  {
    rule: 'answers-for-human',
    re: /\banswer_question\b|\bon (the )?(human|user|trail lead)('s)? behalf\b/i,
    message: "answers on the human's behalf",
    level: 'error',
  },
  {
    rule: 'answers-for-human',
    re: /\banswer\b[^.\n]{0,40}\b(yourself|for (the )?(human|user|trail lead))\b|\binstead of (asking )?(the )?(human|user|trail lead)\b/i,
    message: "answers on the human's behalf",
    level: 'error',
  },
  {
    rule: 'secret-file',
    re: /\.config\/gh\b|\bhosts\.yml\b|\.git-credentials|\.ssh\/|\bid_(rsa|ed25519|ecdsa)\b|\.aws\/credentials|\.netrc\b|\.npmrc\b|\.pypirc\b|\.docker\/config|\.kube\/config|\.gnupg\b/i,
    message: 'names a file that holds credentials',
    level: 'error',
  },
  {
    rule: 'self-approval',
    re: /\b(approve|pass|accept|sign off|mark)\b[^.\n]{0,30}\b(your|its|their) own\b/i,
    message: 'approves its own work',
    level: 'error',
  },
  {
    rule: 'around-human',
    re: /\b(never|don'?t|do not|avoid|no need to|without)\b[^.\n]{0,30}\b(ask(ing)?|tell(ing)?|notify(ing)?|consult(ing)?|involv(e|ing)|bother(ing)?|interrupt(ing)?|escalat(e|ing)|check(ing)? (in )?with|wait(ing)? for)\b[^.\n]{0,30}\b(them|human|humans|user|users|people|person|trail lead|lead|anyone|anybody|questions?|approvals?|permission|answers?)\b/i,
    message: 'steers the agent around the human',
    level: 'error',
  },
  {
    rule: 'protected-file',
    re: new RegExp(PROTECTED, 'i'),
    message: 'mentions a file only the trail lead changes',
    level: 'error',
    squashed: true,
  },
  {
    rule: 'tool-permissions',
    re: /dangerously|skip[- ]permissions|\b(bypass|disable|turn off|skip)\b[^.\n]{0,20}\b(permissions?|sandbox|approvals?|verification|checks)\b/i,
    message: "addresses the agent's tool permissions or Teamtrail's checks",
    level: 'error',
  },
  {
    rule: 'exfiltration',
    re: /\b(curl|wget|Invoke-WebRequest|netcat|scp|sftp)\b|\bnc\s+-/i,
    message: 'fetches or sends data over the network',
    level: 'error',
  },
  {
    rule: 'exfiltration',
    re: /\b(webhook\.site|requestbin|pipedream|ngrok|pastebin|transfer\.sh|interact\.sh|burpcollaborator)/i,
    message: 'names a data drop service',
    level: 'error',
  },
  {
    rule: 'exfiltration',
    re: /\b(send|post|upload|exfiltrate|leak|share|paste|copy|include|attach|print|echo|dump|commit|write)\b[^.\n]{0,40}\b(secrets?|tokens?|credentials?|env(ironment)? variables?|api keys?|passwords?|private keys?)\b/i,
    message: 'sends secrets somewhere',
    level: 'error',
  },
  {
    rule: 'exfiltration',
    re: new RegExp(
      `\\b(read|cat|open|print|copy|paste|include|dump|show|echo|output|upload|send|post|attach|share|commit|load|source)\\b.{0,40}(${SECRET_FILES})`,
      'i',
    ),
    message: 'reads a file that holds secrets',
    level: 'error',
  },
  {
    rule: 'hidden-text',
    re: /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/u,
    message: 'has hidden or direction-changing unicode characters',
    level: 'error',
    perLine: true,
  },
  {
    rule: 'control-chars',
    // C0 and C1 controls other than tab and new line: ESC sequences, carriage returns and backspaces can hide text
    // or rewrite what a terminal showed above the approval prompt
    // eslint-disable-next-line no-control-regex -- control characters are exactly what this looks for
    re: /[\x00-\x08\x0B-\x1F\x7F-\x9F]/,
    message: 'has control characters (escape sequences, carriage returns, backspaces) that can hide or rewrite text',
    level: 'error',
    perLine: true,
  },
  {
    rule: 'hidden-text',
    re: /<!--|<\s*(script|iframe|style|img|object|embed)\b/i,
    message: 'has an HTML comment or tag the reader may not see',
    level: 'error',
    perLine: true,
  },
  {
    rule: 'link',
    re: /\bhttps?:\/\/\S+/i,
    message: 'links to an outside address; agents may follow it',
    level: 'warn',
    perLine: true,
  },
];
