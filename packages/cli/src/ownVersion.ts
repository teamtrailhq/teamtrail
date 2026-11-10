declare const __VERSION__: string | undefined;

/**
 * This CLI's version: build.mjs writes it in for `__VERSION__`. Undefined where the source runs unbuilt (tests,
 * the Lookout's dev plugin), which have no published version to name. Declared here, not only in globals.d.ts,
 * so the files that import it typecheck in the Lookout's project too.
 */
export const OWN_VERSION: string | undefined = typeof __VERSION__ === 'string' ? __VERSION__ : undefined;
