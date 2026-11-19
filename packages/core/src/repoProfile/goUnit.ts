import type { RepoUnit, Toolchain, UnitCommand } from '../model/repoProfile';
import { depNeeds } from './depNeeds';
import type { UnitContext } from './types';

const LINT_CONFIGS = ['.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json'];

/** The Go version go.mod asks for: its `toolchain` line, else its `go` directive. */
function goPin(text: string, file: string): Toolchain | undefined {
  const toolchain = /^toolchain\s+go(\S+)/m.exec(text)?.[1];
  if (toolchain) return { name: 'go', version: toolchain, from: `${file} toolchain` };
  const go = /^go\s+(\S+)/m.exec(text)?.[1];
  return go ? { name: 'go', version: go, from: `${file} go` } : undefined;
}

/** The module paths go.mod requires, one per `require` line or block entry. */
function requires(text: string): string[] {
  return [...text.matchAll(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]+\/[^\s]+)\s+v\S+/gm)].map((m) => m[1]);
}

/** A Go module (go.mod): `go test ./...` and `go vet ./...`, golangci-lint with its config, and the go.work it's in. */
export async function goUnit(ctx: UnitContext): Promise<RepoUnit[]> {
  const { folder } = ctx;
  if (!folder.files.has('go.mod')) return [];
  const text = (await ctx.read('go.mod')) ?? '';
  const file = folder.dir ? `${folder.dir}/go.mod` : 'go.mod';
  const work = ctx.memberOf(['go-work']);
  const commands: UnitCommand[] = [
    { role: 'test', run: ['go', 'test', './...'], cwd: folder.dir, from: 'go.mod' },
    { role: 'lint', run: ['go', 'vet', './...'], cwd: folder.dir, from: 'go.mod' },
  ];
  const lintConfig = LINT_CONFIGS.find((f) => folder.files.has(f) || ctx.top.files.has(f));
  if (lintConfig) commands.push({ role: 'lint', run: ['golangci-lint', 'run'], cwd: folder.dir, from: lintConfig });
  const toolchain = goPin(text, file);
  return [
    {
      dir: folder.dir,
      ecosystem: 'go',
      manager: 'go',
      manifest: 'go.mod',
      ...(folder.files.has('go.sum') ? { lockfile: 'go.sum' } : {}),
      ...(work ? { memberOf: work.dir } : {}),
      ...(toolchain ? { toolchain } : {}),
      install: ['go', 'mod', 'download'],
      commands,
      needs: depNeeds({ deps: requires(text), file }),
    },
  ];
}
