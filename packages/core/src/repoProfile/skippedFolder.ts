/** Folders that hold installed packages, build output, caches or test data, never a unit of the repo's own. */
const SKIPPED = new Set([
  'node_modules',
  'bower_components',
  'vendor',
  'venv',
  'env',
  'target',
  'dist',
  'build',
  'out',
  'bin',
  'obj',
  'coverage',
  '__pycache__',
  'site-packages',
  'Pods',
  'DerivedData',
  'fixtures',
  '__fixtures__',
  'testdata',
  'test-fixtures',
]);

/** Whether the walk skips a folder: the ones above and every dot folder (`.git`, `.venv`, `.teamtrail`). */
export function isSkippedFolder(name: string): boolean {
  return name.startsWith('.') || SKIPPED.has(name);
}
