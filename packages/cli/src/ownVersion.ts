/** This CLI's version (set by build.mjs); undefined when the source runs unbuilt (tests, the dev plugin). */
export const OWN_VERSION: string | undefined = typeof __VERSION__ === 'string' ? __VERSION__ : undefined;
