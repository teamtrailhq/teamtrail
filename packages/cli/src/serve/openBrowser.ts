import { spawn } from 'node:child_process';

export function openBrowser(url: string) {
  const [cmd, args] = opener(url);
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => process.stdout.write(`  Open ${url} in your browser.\n`));
    child.unref();
  } catch {
    process.stdout.write(`  Open ${url} in your browser.\n`);
  }
}

/**
 * The platform's command that opens a URL in the default browser. On Windows through `url.dll`, not `cmd /c start`:
 * no shell parses the URL, so `&` or `^` in it mean nothing.
 */
function opener(url: string): [string, string[]] {
  if (process.platform === 'darwin') return ['open', [url]];
  if (process.platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]];
  return ['xdg-open', [url]];
}
