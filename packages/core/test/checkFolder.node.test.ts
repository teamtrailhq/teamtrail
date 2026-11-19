import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkFolderProblem } from '../src/verification/checkFolder';
import { localRepoFiles } from '../src/verification/localRepoFiles';
import { memoryRepoFiles } from './fakes/memoryRepoFiles';
import { tempFolder } from './tempFolder';

/** A git checkout with a real sub-folder, a link to it inside the repo and a link out of it. */
function repo() {
  const dir = tempFolder('teamtrail-checkfolder-');
  const outside = tempFolder('teamtrail-outside-');
  mkdirSync(path.join(dir, '.git'));
  mkdirSync(path.join(dir, 'apps', 'web'), { recursive: true });
  writeFileSync(path.join(dir, 'apps', 'web', 'package.json'), '{}');
  writeFileSync(path.join(dir, 'README.md'), '# x');
  symlinkSync(path.join(dir, 'apps'), path.join(dir, 'linked'));
  symlinkSync(outside, path.join(dir, 'out'));
  return dir;
}

test("a check's folder: a real folder inside the repo, never through a link, in or out", async () => {
  const files = localRepoFiles(repo());
  assert.ok(files);
  assert.equal(await checkFolderProblem({ cwd: 'apps/web', files }), undefined);
  assert.equal(await checkFolderProblem({ cwd: './apps/web/', files }), undefined);
  assert.equal(await checkFolderProblem({ cwd: '', files }), undefined, 'the top');
  assert.match((await checkFolderProblem({ cwd: 'apps/api', files })) ?? '', /no folder apps\/api/);
  assert.match((await checkFolderProblem({ cwd: 'README.md', files })) ?? '', /no folder/);
  assert.match((await checkFolderProblem({ cwd: 'linked/web', files })) ?? '', /no folder/, 'a link inside');
  assert.match((await checkFolderProblem({ cwd: 'out', files })) ?? '', /no folder/, 'a link out');
  assert.match((await checkFolderProblem({ cwd: '../x', files })) ?? '', /isn't a folder inside/);
  assert.match((await checkFolderProblem({ cwd: 'apps/web' })) ?? '', /can't be read here/, 'no files to read');
  assert.equal(await checkFolderProblem({ cwd: '', files: undefined }), undefined);
});

test('without a listing, the folder is asked for by kind', async () => {
  const mem = memoryRepoFiles({ 'apps/web/package.json': '{}' });
  const files = { read: mem.read, kind: mem.kind };
  assert.equal(await checkFolderProblem({ cwd: 'apps/web', files }), undefined);
  assert.match((await checkFolderProblem({ cwd: 'apps/web/package.json', files })) ?? '', /no folder/);
});

test('localRepoFiles lists a folder sorted, links left out, nothing outside the repo', async () => {
  const dir = repo();
  const files = localRepoFiles(dir);
  assert.ok(files?.list);
  assert.deepEqual(await files.list(''), [
    { name: '.git', kind: 'dir' },
    { name: 'README.md', kind: 'file' },
    { name: 'apps', kind: 'dir' },
  ]);
  assert.deepEqual(await files.list('apps/web'), [{ name: 'package.json', kind: 'file' }]);
  assert.equal(await files.list('out'), undefined, 'a link out of the repo lists nothing');
  assert.equal(await files.list('../'), undefined);
  assert.equal(await files.list('README.md'), undefined, 'a file is no folder');
});
