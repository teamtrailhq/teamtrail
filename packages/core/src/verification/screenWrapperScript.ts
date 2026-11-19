import { repoPath } from './repoPath';
import { screenProjectFile } from './screenStacks';
import type { Found, ScreenInput } from './screenTypes';

/** What a build tool's wrapper script needs beside it: the wrapper's settings, from which it fetches the tool. */
const WRAPPERS: Record<string, { needs: string[]; program: string }> = {
  gradlew: {
    needs: ['gradle/wrapper/gradle-wrapper.properties', 'gradle/wrapper/gradle-wrapper.jar'],
    program: 'gradle',
  },
  'gradlew.bat': {
    needs: ['gradle/wrapper/gradle-wrapper.properties', 'gradle/wrapper/gradle-wrapper.jar'],
    program: 'gradle',
  },
  mvnw: { needs: ['.mvn/wrapper/maven-wrapper.properties'], program: 'mvn' },
  'mvnw.cmd': { needs: ['.mvn/wrapper/maven-wrapper.properties'], program: 'mvn' },
};

/**
 * `./gradlew test`, `./mvnw verify`: the wrapper's own files next to the script (without them it stops), then the
 * build's project file in the folder the check runs in, as `gradle` and `mvn` need.
 */
export async function screenWrapperScript(i: ScreenInput & { rel: string }): Promise<Found[]> {
  const name = i.rel.split('/').pop() ?? i.rel;
  const spec = WRAPPERS[name];
  if (!spec) return [];
  const dir = i.rel.split('/').slice(0, -1).join('/');
  for (const need of spec.needs) {
    const rel = repoPath(dir, need) ?? need;
    if ((await i.files.kind(rel)) !== 'file') return [{ severity: 'wont-run', text: `No \`${rel}\` for ${name}` }];
  }
  return (await screenProjectFile(spec.program, i)) ?? [];
}
