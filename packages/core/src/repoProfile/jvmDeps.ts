/** The dependency groups a Gradle build or a pom names that the profile's needs know (depNeeds.ts). */
export function jvmDeps(text: string): string[] {
  const out: string[] = [];
  if (/org\.testcontainers/.test(text)) out.push('org.testcontainers');
  if (/org\.seleniumhq\.selenium/.test(text)) out.push('org.seleniumhq.selenium');
  if (/com\.microsoft\.playwright/.test(text)) out.push('com.microsoft.playwright');
  return out;
}
