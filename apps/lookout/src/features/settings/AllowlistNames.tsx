import type { CheckVariables } from '@teamtrail/core';
import { Disclosure } from '../../components/ui';

/** The names every check gets when they're set, out of the way: the basics, toolchains, proxies and certificates. */
export function AllowlistNames({ allowlist }: { allowlist: CheckVariables['allowlist'] }) {
  const all = [...allowlist.names, ...allowlist.prefixes.map((p) => `${p}*`)];
  return (
    <Disclosure label={`Always passed when set (${all.length})`}>
      <p className="set-hint t-meta">
        The shell, locale and toolchain basics. A name that reads like a secret (TOKEN, KEY, PASSWORD…) is left out even
        when it matches.
      </p>
      <p className="cv-allowlist t-code">{all.join(' ')}</p>
    </Disclosure>
  );
}
