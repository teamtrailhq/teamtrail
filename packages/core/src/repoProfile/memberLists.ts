const unquote = (s: string) => s.trim().replace(/^(["'])(.*)\1$/, '$2');

/** The `- item` entries under a top-level YAML key (`packages:` in pnpm-workspace.yaml). */
export function yamlListUnder(text: string, key: string): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of text.split('\n')) {
    if (/^\S/.test(line)) inside = line.trim() === `${key}:`;
    else if (inside) {
      const item = /^\s+-\s+(.+?)\s*(#.*)?$/.exec(line)?.[1];
      if (item) out.push(unquote(item));
    }
  }
  return out;
}

/** The project paths a Gradle settings file includes: `include("app", ":libs:core")` → `app`, `libs/core`. */
export function gradleIncludes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*include\b(.*)$/gm)) {
    for (const q of m[1].matchAll(/["']([^"']+)["']/g)) out.push(q[1].replace(/^:/, '').replace(/:/g, '/'));
  }
  return out;
}

/** The `<module>` entries of a Maven pom. */
export const mavenModules = (text: string) => [...text.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)].map((m) => m[1]);

/** The folders a go.work `use`s, as one line or a block. */
export function goWorkUses(text: string): string[] {
  const out: string[] = [];
  const block = /^use\s*\(([\s\S]*?)\)/m.exec(text)?.[1];
  for (const line of block?.split('\n') ?? [])
    if (line.trim())
      out.push(
        line
          .trim()
          .replace(/\/\/.*/, '')
          .trim(),
      );
  for (const m of text.matchAll(/^use\s+([^\s(]+)/gm)) out.push(m[1]);
  return out.filter(Boolean).map((p) => p.replace(/^\.\//, ''));
}

/** The folders of the projects a .NET solution lists (`Project(...) = "Api", "src\Api\Api.csproj", ...`). */
export function solutionProjects(text: string): string[] {
  const paths = [...text.matchAll(/^Project\([^)]*\)\s*=\s*"[^"]*",\s*"([^"]+\.(?:cs|fs|vb)proj)"/gm)].map((m) => m[1]);
  const xml = [...text.matchAll(/<Project\s+Path="([^"]+\.(?:cs|fs|vb)proj)"/g)].map((m) => m[1]);
  return [...paths, ...xml].map((p) => p.replace(/\\/g, '/').split('/').slice(0, -1).join('/')).filter(Boolean);
}
