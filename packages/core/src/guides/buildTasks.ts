/**
 * Build tools whose argv is flags and task names in any order (`./gradlew --no-daemon :app:test`, `mvn -B -pl web
 * verify`): a known check when every task is one that checks or builds, and no flag points the build at code from
 * elsewhere (an init script, another settings file). `valued` flags take the next word, which isn't a task.
 */
export interface BuildTasks {
  tasks: RegExp;
  valued: string[];
  deny: string[];
}

const GRADLE: BuildTasks = {
  tasks:
    /^(?::?[\w-]+:)*(?:test|check|build|assemble|clean|lint\w*|spotlessCheck|ktlintCheck|detekt\w*|compile\w*|\w*UnitTest|integrationTest|connectedCheck|jacocoTest\w*|javadoc)$/,
  valued: ['-p', '--project-dir', '--tests', '--console', '--warning-mode', '--max-workers', '--priority'],
  deny: ['-I', '--init-script', '-c', '--settings-file', '-b', '--build-file', '--include-build'],
};

const MAVEN: BuildTasks = {
  tasks:
    /^(?:clean|validate|compile|test-compile|test|package|verify|integration-test|(?:checkstyle|spotless|spotbugs|pmd|jacoco|enforcer):(?:check|enforce|report))$/,
  valued: ['-pl', '--projects', '-P', '--activate-profiles', '-f', '--file', '-T', '--threads', '-rf', '--resume-from'],
  deny: ['-s', '--settings', '-gs', '--global-settings', '-t', '--toolchains'],
};

export const BUILD_TASKS: Record<string, BuildTasks> = { gradle: GRADLE, gradlew: GRADLE, mvn: MAVEN, mvnw: MAVEN };

/** Whether the args are tasks the build tool knows as checks, with flags that keep the build in the repo. */
export function fitsTasks(spec: BuildTasks, args: string[]): boolean {
  const tasks: string[] = [];
  for (let n = 0; n < args.length; n++) {
    const a = args[n];
    const name = a.split('=')[0];
    if (spec.deny.includes(name)) return false;
    if (a.startsWith('-')) {
      if (spec.valued.includes(a)) n++;
      continue;
    }
    tasks.push(a);
  }
  return tasks.length > 0 && tasks.every((t) => spec.tasks.test(t));
}
