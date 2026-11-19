/**
 * Where a tool reads its config. `files`: config files by name, the whole file counts. `paths`: config files by their
 * path from the repo root (`.cargo/config.toml`, `gradle/wrapper/gradle-wrapper.properties`), where the name alone
 * would say too little. `sections`: shared files where only the tool's own section counts (pyproject.toml's
 * `[tool.pytest.ini_options]`, Cargo.toml's `[profile.test]`), so a dependency added there changes nothing.
 * `pkgKeys`: package.json keys it reads (`jest`).
 */
export interface RunnerConfig {
  files: RegExp[];
  paths?: RegExp[];
  sections?: { file: RegExp; header: RegExp }[];
  pkgKeys?: string[];
}
