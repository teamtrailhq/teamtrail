/** A toolchain's program and how it prints its version. */
export interface ToolchainProgram {
  /** The program to find on PATH, in order of preference. */
  programs: string[];
  /** The argument that prints its version. */
  versionArgs: string[];
  /** How a person names it: `Node`, `Python`. */
  label: string;
}

const TOOLCHAINS: Record<string, ToolchainProgram> = {
  node: { programs: ['node'], versionArgs: ['--version'], label: 'Node' },
  python: { programs: ['python3', 'python'], versionArgs: ['--version'], label: 'Python' },
  go: { programs: ['go'], versionArgs: ['version'], label: 'Go' },
  rust: { programs: ['rustc'], versionArgs: ['--version'], label: 'Rust' },
  java: { programs: ['java'], versionArgs: ['-version'], label: 'Java' },
  ruby: { programs: ['ruby'], versionArgs: ['--version'], label: 'Ruby' },
  php: { programs: ['php'], versionArgs: ['--version'], label: 'PHP' },
  dotnet: { programs: ['dotnet'], versionArgs: ['--version'], label: '.NET' },
  deno: { programs: ['deno'], versionArgs: ['--version'], label: 'Deno' },
  bun: { programs: ['bun'], versionArgs: ['--version'], label: 'Bun' },
};

/** The program of a toolchain the repo profile names (`node`, `python`, `go`…), or undefined for one it doesn't know. */
export function toolchainProgram(name: string): ToolchainProgram | undefined {
  return Object.hasOwn(TOOLCHAINS, name) ? TOOLCHAINS[name] : undefined;
}
