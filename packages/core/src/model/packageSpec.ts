import { BRAND } from './brand';
import { shellLine } from './shellQuote';

const RELEASE = /^\d+\.\d+\.\d+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

/**
 * The npm package at one exact version (`teamtrail@0.25.0`), which is what every command Teamtrail prints or
 * registers names: a bare `teamtrail` means "whatever is newest on npm when this runs". Without a version that
 * is a release or pre-release number, the bare name is all there is.
 */
export function packageSpec(version?: string) {
  return version && RELEASE.test(version) ? `${BRAND.npm}@${version}` : BRAND.npm;
}

/** `npx -y teamtrail@<version> <args…>` as one line to copy, every argument quoted for a shell. */
export function npxCommand(version: string | undefined, args: string[]) {
  return shellLine(['npx', '-y', packageSpec(version), ...args]);
}
