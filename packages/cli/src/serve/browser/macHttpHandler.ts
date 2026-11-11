import type { HandlerDeps, HttpHandler } from './types';

/** Asks LaunchServices which app opens http URLs, and answers its bundle id. */
const JXA = [
  "ObjC.import('AppKit');",
  "const app = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString('http://127.0.0.1/'));",
  "app.isNil() ? '' : $.NSBundle.bundleWithURL(app).bundleIdentifier.js;",
].join('\n');

const BUNDLE_ID = /^[A-Za-z0-9][A-Za-z0-9.-]{0,200}$/;

/** macOS: the default browser by bundle id, opened with `open -b <id> <file>`. */
export function macHttpHandler(deps: Pick<HandlerDeps, 'run'>): HttpHandler {
  let id: string;
  try {
    id = deps.run('osascript', ['-l', 'JavaScript', '-e', JXA]).trim();
  } catch (e) {
    return { kind: 'none', why: `couldn't ask macOS for the default browser (${(e as Error).message.split('\n')[0]})` };
  }
  if (!BUNDLE_ID.test(id)) return { kind: 'none', why: 'macOS named no default browser' };
  return { kind: 'app', name: id, command: (file) => ['open', ['-b', id, file]] };
}
