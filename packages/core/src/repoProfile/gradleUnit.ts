import type { RepoUnit, Toolchain } from '../model/repoProfile';
import { depNeeds } from './depNeeds';
import { jvmDeps } from './jvmDeps';
import { toolPin } from './toolPin';
import type { UnitContext } from './types';

const MANIFESTS = ['settings.gradle.kts', 'settings.gradle', 'build.gradle.kts', 'build.gradle'];

/** The Java version a Gradle build asks for: its toolchain's languageVersion, else sourceCompatibility. */
function buildPin(text: string, file: string): Toolchain | undefined {
  const toolchain = /JavaLanguageVersion\.of\(\s*(\d+)\s*\)/.exec(text)?.[1];
  if (toolchain) return { name: 'java', version: toolchain, from: `${file} toolchain` };
  const source = /sourceCompatibility\s*=\s*(?:JavaVersion\.VERSION_)?['"]?([\d._]+)/.exec(text)?.[1];
  return source ? { name: 'java', version: source.replace('_', '.'), from: `${file} sourceCompatibility` } : undefined;
}

/**
 * A Gradle build (build.gradle(.kts) or settings.gradle(.kts)): `test` and `check` through the wrapper when the repo
 * has one (`./gradlew`), else `gradle`. A subproject a settings file includes is built from that settings folder.
 */
export async function gradleUnit(ctx: UnitContext): Promise<RepoUnit[]> {
  const { folder } = ctx;
  const manifest = MANIFESTS.find((f) => folder.files.has(f));
  if (!manifest) return [];
  const build = ['build.gradle.kts', 'build.gradle'].find((f) => folder.files.has(f));
  const text = build ? ((await ctx.read(build)) ?? '') : '';
  const file = folder.dir ? `${folder.dir}/${build ?? manifest}` : (build ?? manifest);
  const member = ctx.memberOf(['gradle']);
  const gradle = folder.files.has('gradlew') ? './gradlew' : 'gradle';
  const pinned = await toolPin(ctx, { name: 'java', files: ['.java-version'], aliases: ['java'] });
  const toolchain = pinned ?? buildPin(text, file);
  const commands = member
    ? []
    : [
        { role: 'test' as const, run: [gradle, 'test'], cwd: folder.dir, from: manifest },
        { role: 'check' as const, run: [gradle, 'check'], cwd: folder.dir, from: manifest },
      ];
  return [
    {
      dir: folder.dir,
      ecosystem: 'jvm',
      manager: 'gradle',
      manifest,
      ...(folder.files.has('gradle.lockfile') ? { lockfile: 'gradle.lockfile' } : {}),
      ...(member ? { memberOf: member.dir } : {}),
      ...(toolchain ? { toolchain } : {}),
      ...(member ? {} : { install: [gradle, '--no-daemon', 'dependencies'] }),
      commands,
      needs: depNeeds({ deps: jvmDeps(text), file }),
    },
  ];
}
