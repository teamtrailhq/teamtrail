import path from 'node:path';
import type { HandlerDeps, HttpHandler } from './types';

const DESKTOP_ID = /^[A-Za-z0-9][\w.-]{0,200}\.desktop$/;

/** Where desktop entries live (XDG base directories), the user's own first. */
function applicationDirs(deps: HandlerDeps) {
  const home = deps.env.XDG_DATA_HOME || path.join(deps.home, '.local', 'share');
  const system = (deps.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean);
  return [home, ...system].map((d) => path.join(d, 'applications'));
}

/**
 * Linux: the default web browser's desktop entry (`xdg-settings`), launched on the file with `gio launch`. A snap
 * or Flatpak browser can't read hidden folders in the home folder, where the page is, so it gets none.
 */
export function linuxHttpHandler(deps: HandlerDeps): HttpHandler {
  let id: string;
  try {
    id = deps.run('xdg-settings', ['get', 'default-web-browser']).trim();
  } catch {
    return { kind: 'none', why: "couldn't ask xdg-settings for the default browser" };
  }
  if (!DESKTOP_ID.test(id)) return { kind: 'none', why: 'no default browser is set (xdg-settings)' };
  for (const dir of applicationDirs(deps)) {
    const entry = path.join(dir, id);
    const text = deps.readFile(entry);
    if (text === undefined) continue;
    if (/snap|flatpak/i.test(`${entry}\n${text}`))
      return { kind: 'none', why: `the default browser (${id}) is a snap or Flatpak, which can't read the page` };
    return { kind: 'app', name: id, command: (file) => ['gio', ['launch', entry, file]] };
  }
  return { kind: 'none', why: `the default browser's desktop entry (${id}) wasn't found` };
}
