import type { WorkspaceTool } from '../model/repoProfile';
import { jsonObject } from './jsonObject';
import { goWorkUses, gradleIncludes, mavenModules, solutionProjects, yamlListUnder } from './memberLists';
import { nodeManager } from './nodeManager';
import { tomlTables } from './tomlLite';
import type { FolderView, ProfileReader } from './types';

type Found = Omit<WorkspaceTool, 'dir'>;

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** npm, yarn or bun `workspaces` (a list, or `{packages}`), and pnpm-workspace.yaml. */
async function nodeWorkspaces(folder: FolderView, read: (f: string) => Promise<string | undefined>) {
  const out: Found[] = [];
  if (folder.files.has('pnpm-workspace.yaml')) {
    const members = yamlListUnder((await read('pnpm-workspace.yaml')) ?? '', 'packages');
    out.push({ tool: 'pnpm', from: 'pnpm-workspace.yaml', members });
  }
  if (!folder.files.has('package.json')) return out;
  const pkg = jsonObject(await read('package.json'));
  const ws = pkg?.workspaces;
  const members = Array.isArray(ws) ? strings(ws) : strings((ws as { packages?: unknown } | undefined)?.packages);
  const tool = (nodeManager(folder, pkg)?.manager ?? 'npm') as WorkspaceTool['tool'];
  if (members.length && !out.length) out.push({ tool, from: 'package.json workspaces', members });
  return out;
}

/** Task runners over a Node workspace: detected by their config, no members of their own. */
function taskRunners(folder: FolderView): Found[] {
  const out: Found[] = [];
  if (folder.files.has('nx.json')) out.push({ tool: 'nx', from: 'nx.json', members: [] });
  if (folder.files.has('turbo.json')) out.push({ tool: 'turbo', from: 'turbo.json', members: [] });
  if (folder.files.has('lerna.json')) out.push({ tool: 'lerna', from: 'lerna.json', members: [] });
  return out;
}

/** go.work, Cargo `[workspace]`, Gradle settings, Maven modules, uv workspaces and .NET solutions. */
async function otherWorkspaces(folder: FolderView, read: (f: string) => Promise<string | undefined>) {
  const out: Found[] = [];
  const has = (f: string) => folder.files.has(f);
  if (has('go.work'))
    out.push({ tool: 'go-work', from: 'go.work', members: goWorkUses((await read('go.work')) ?? '') });
  if (has('Cargo.toml')) {
    const members = tomlTables((await read('Cargo.toml')) ?? '')
      .get('workspace')
      ?.get('members');
    if (Array.isArray(members)) out.push({ tool: 'cargo', from: 'Cargo.toml [workspace]', members });
  }
  const settings = ['settings.gradle.kts', 'settings.gradle'].find(has);
  if (settings) out.push({ tool: 'gradle', from: settings, members: gradleIncludes((await read(settings)) ?? '') });
  if (has('pom.xml')) {
    const members = mavenModules((await read('pom.xml')) ?? '');
    if (members.length) out.push({ tool: 'maven', from: 'pom.xml <modules>', members });
  }
  if (has('pyproject.toml')) {
    const members = tomlTables((await read('pyproject.toml')) ?? '')
      .get('tool.uv.workspace')
      ?.get('members');
    if (Array.isArray(members)) out.push({ tool: 'uv', from: 'pyproject.toml [tool.uv.workspace]', members });
  }
  for (const sln of [...folder.files].filter((f) => /\.slnx?$/.test(f)).sort())
    out.push({ tool: 'dotnet', from: sln, members: solutionProjects((await read(sln)) ?? '') });
  return out;
}

/** The workspaces declared in one folder, each with the member patterns it names (relative to that folder). */
export async function workspaceTools(folder: FolderView, reader: ProfileReader): Promise<WorkspaceTool[]> {
  const read = (f: string) => reader.read(folder.dir ? `${folder.dir}/${f}` : f);
  const found = [
    ...(await nodeWorkspaces(folder, read)),
    ...taskRunners(folder),
    ...(await otherWorkspaces(folder, read)),
  ];
  return found.map((f) => ({ ...f, dir: folder.dir }));
}
