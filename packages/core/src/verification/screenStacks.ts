import { nearestFile } from './nearestFile';
import type { Found, ScreenInput } from './screenTypes';

/**
 * Programs that need a project file in their folder or one above it, and how to name it when there's none: Gradle's
 * build, Swift's package, Mix's project, a Rakefile… `here`: only the check's own folder counts (Maven reads the
 * pom.xml where it runs).
 */
const PROJECT_FILES: Record<string, { files: string[]; name: string; here?: boolean }> = {
  gradle: {
    files: ['settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts'],
    name: 'build.gradle or settings.gradle',
  },
  mvn: { files: ['pom.xml'], name: 'pom.xml', here: true },
  swift: { files: ['Package.swift'], name: 'Package.swift' },
  mix: { files: ['mix.exs'], name: 'mix.exs' },
  dart: { files: ['pubspec.yaml'], name: 'pubspec.yaml' },
  flutter: { files: ['pubspec.yaml'], name: 'pubspec.yaml' },
  rake: { files: ['Rakefile', 'rakefile', 'Rakefile.rb', 'rakefile.rb'], name: 'Rakefile' },
  nox: { files: ['noxfile.py'], name: 'noxfile.py' },
  pipenv: { files: ['Pipfile'], name: 'Pipfile' },
  poetry: { files: ['pyproject.toml'], name: 'pyproject.toml' },
  bundle: { files: ['Gemfile', 'gems.rb'], name: 'Gemfile' },
  composer: { files: ['composer.json'], name: 'composer.json' },
  turbo: { files: ['turbo.json', 'turbo.jsonc'], name: 'turbo.json' },
  go: { files: ['go.mod'], name: 'go.mod' },
  cargo: { files: ['Cargo.toml'], name: 'Cargo.toml' },
};

/**
 * A program's project file: there (empty), or a `wont-run` naming what's missing and where. Undefined for a program
 * screening knows no project file of.
 */
export async function screenProjectFile(
  program: string,
  i: Pick<ScreenInput, 'files' | 'cwd'>,
): Promise<Found[] | undefined> {
  const spec = PROJECT_FILES[program];
  if (!spec) return undefined;
  if (await nearestFile({ ...i, names: spec.files, here: spec.here })) return [];
  if (program === 'go' && (await nearestFile({ ...i, names: ['go.work'] })))
    return [{ severity: 'unsure', text: 'No go.mod here; go.work lists the modules, so only paths into them run' }];
  let where = '';
  if (i.cwd) where = spec.here ? ` in \`${i.cwd}\`` : ` in \`${i.cwd}\` or above it`;
  return [{ severity: 'wont-run', text: `No ${spec.name}${where}` }];
}
