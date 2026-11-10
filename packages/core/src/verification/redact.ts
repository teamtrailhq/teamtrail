const SECRETS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,
  /\bxapp-[A-Za-z0-9-]{10,}\b/g,
  /\blin_api_[A-Za-z0-9]{20,}\b/g,
];

/** Token-shaped strings replaced, before output is stored or shown to an agent. */
export const redact = (text: string) => SECRETS.reduce((s, re) => s.replace(re, '[redacted]'), text);

/** The last `lines` lines, at most `bytes` characters, redacted. */
export function tailOf(text: string, lines = 60, bytes = 4096) {
  const kept = text.replace(/\r\n?/g, '\n').trimEnd().split('\n').slice(-lines).join('\n');
  return redact(kept.length > bytes ? kept.slice(-bytes) : kept);
}
