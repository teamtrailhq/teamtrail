import type { RepoUnit, Toolchain } from '../model/repoProfile';
import { depNeeds } from './depNeeds';
import { jvmDeps } from './jvmDeps';
import { toolPin } from './toolPin';
import type { UnitContext } from './types';

const PROPERTIES = ['maven.compiler.release', 'maven.compiler.source', 'java.version', 'release'];

/** The Java version a pom asks for, from its compiler properties. */
function pomPin(text: string, file: string): Toolchain | undefined {
  for (const name of PROPERTIES) {
    const version = new RegExp(`<${name.replace(/\./g, '\\.')}>\\s*([\\d.]+)\\s*</`).exec(text)?.[1];
    if (version) return { name: 'java', version, from: `${file} ${name}` };
  }
  return undefined;
}

/**
 * A Maven project (pom.xml): `test` and `verify` in batch mode through the wrapper when the repo has one
 * (`./mvnw`), else `mvn`. A module a parent pom lists is built from the parent's folder.
 */
export async function mavenUnit(ctx: UnitContext): Promise<RepoUnit[]> {
  const { folder } = ctx;
  if (!folder.files.has('pom.xml')) return [];
  const text = (await ctx.read('pom.xml')) ?? '';
  const file = folder.dir ? `${folder.dir}/pom.xml` : 'pom.xml';
  const member = ctx.memberOf(['maven']);
  const mvn = folder.files.has('mvnw') ? './mvnw' : 'mvn';
  const pinned = await toolPin(ctx, { name: 'java', files: ['.java-version'], aliases: ['java'] });
  const toolchain = pinned ?? pomPin(text, file);
  const commands = member
    ? []
    : [
        { role: 'test' as const, run: [mvn, 'test', '-B'], cwd: folder.dir, from: 'pom.xml' },
        { role: 'check' as const, run: [mvn, 'verify', '-B'], cwd: folder.dir, from: 'pom.xml' },
      ];
  return [
    {
      dir: folder.dir,
      ecosystem: 'jvm',
      manager: 'maven',
      manifest: 'pom.xml',
      ...(member ? { memberOf: member.dir } : {}),
      ...(toolchain ? { toolchain } : {}),
      ...(member ? {} : { install: [mvn, '-B', 'dependency:go-offline'] }),
      commands,
      needs: depNeeds({ deps: jvmDeps(text), file }),
    },
  ];
}
