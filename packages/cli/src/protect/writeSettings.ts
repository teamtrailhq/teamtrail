import fs from 'node:fs';
import path from 'node:path';

/** The indentation a JSON file already uses (its first indented line), else two spaces. */
export function indentOf(text: string | undefined): string | number {
  const m = text?.match(/^[{[][^\n]*\n([ \t]+)\S/);
  return m ? m[1] : 2;
}

/**
 * Writes `settings` over `file` atomically: to a temp file beside the real one (a symlink is followed to its
 * target, and stays a symlink), with the same mode, then renamed into place, so an agent reading the file never
 * sees half of it and a dotfiles link isn't replaced by a copy. Keeps the file's indentation.
 */
export function writeSettings(file: string, settings: unknown) {
  const target = fs.existsSync(file) ? fs.realpathSync(file) : file;
  const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined;
  const mode = before === undefined ? undefined : fs.statSync(target).mode & 0o777;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temp, `${JSON.stringify(settings, null, indentOf(before))}\n`, { mode: mode ?? 0o644 });
    if (mode !== undefined) fs.chmodSync(temp, mode);
    fs.renameSync(temp, target);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
