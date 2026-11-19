/** Programs whose npm package has another name (`ng` comes with `@angular/cli`). */
const PACKAGES: Record<string, string[]> = {
  ng: ['@angular/cli'],
  tsc: ['typescript'],
  tsserver: ['typescript'],
  playwright: ['@playwright/test', 'playwright'],
  biome: ['@biomejs/biome'],
  'svelte-kit': ['@sveltejs/kit'],
  nuxi: ['nuxi', 'nuxt'],
  nuxt: ['nuxt', 'nuxi'],
  'run-s': ['npm-run-all', 'npm-run-all2'],
  'run-p': ['npm-run-all', 'npm-run-all2'],
  'npm-run-all': ['npm-run-all', 'npm-run-all2'],
  'vue-cli-service': ['@vue/cli-service'],
  lerna: ['lerna'],
  stylelint: ['stylelint'],
  'ts-node': ['ts-node'],
  'react-scripts': ['react-scripts'],
  'vue-tsc': ['vue-tsc'],
  'svelte-check': ['svelte-check'],
};

/** The npm packages that install a program of this name: those named above, else the program's own name. */
export function packagesOf(bin: string): string[] {
  return PACKAGES[bin] ?? [bin];
}
