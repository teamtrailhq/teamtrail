import fs from 'node:fs';

/** A Claude Code settings file as a plain JSON object: `{}` when there is none, undefined when it isn't one. */
export function readSettings(file: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    const plain = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    return plain ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
