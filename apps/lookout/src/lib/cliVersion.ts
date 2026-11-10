declare const __CLI_VERSION__: string | undefined;

/**
 * The version of the CLI this Lookout was built into (packages/cli/package.json at build time, see
 * vite.config.ts): what the commands it shows are pinned to. Undefined where nothing defined it (tests).
 */
export const CLI_VERSION: string | undefined = typeof __CLI_VERSION__ === 'string' ? __CLI_VERSION__ : undefined;
