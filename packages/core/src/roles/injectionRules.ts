/**
 * Text a role must never carry: it would steer the agent around Teamtrail's rules or the human. Each rule is checked
 * line by line over the whole file (frontmatter included, since checklist items are read by the agent too).
 */
export interface TextRule {
  rule: string;
  re: RegExp;
  message: string;
  level: 'error' | 'warn';
}

const PROTECTED = 'verification\\.json|roles\\.lock\\.json|roles\\.json|policy\\.json|attention\\.json|workspaces\\.json';

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
    rule: 'self-approval',
    re: /\b(approve|pass|accept|sign off|mark)\b[^.\n]{0,30}\b(your|its|their) own\b/i,
    message: 'approves its own work',
    level: 'error',
  },
  {
    rule: 'protected-file',
    re: new RegExp(`(${PROTECTED})|\\.teamtrail/`, 'i'),
    message: 'mentions a file only the trail lead changes',
    level: 'error',
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
    re: /\b(send|post|upload|exfiltrate|leak|share)\b[^.\n]{0,40}\b(secrets?|tokens?|credentials?|env(ironment)? variables?|api keys?|\.env)\b/i,
    message: 'sends secrets somewhere',
    level: 'error',
  },
  {
    rule: 'hidden-text',
    re: /[­​-‏‪-‮⁠-⁤⁦-⁩﻿]|[\u{E0000}-\u{E007F}]/u,
    message: 'has hidden or direction-changing unicode characters',
    level: 'error',
  },
  {
    rule: 'hidden-text',
    re: /<!--|<\s*(script|iframe|style|img|object|embed)\b/i,
    message: 'has an HTML comment or tag the reader may not see',
    level: 'error',
  },
  {
    rule: 'link',
    re: /\bhttps?:\/\/\S+/i,
    message: 'links to an outside address; agents may follow it',
    level: 'warn',
  },
];

/** argv[0] values a proposed check may not start with. */
export const SHELLS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'cmd', 'cmd.exe', 'powershell', 'pwsh']);
export const NETWORK_TOOLS = new Set(['curl', 'wget', 'nc', 'netcat', 'scp', 'sftp', 'ssh', 'ftp']);
/** Interpreter flags that run code given inline instead of a file in the repo. */
export const INLINE_CODE = /^(-e|--eval|-c|-p|--print|-Command|-EncodedCommand)$/;
