import type { WorkspaceTool } from '../model/repoProfile';
import { matchesMembers } from './globMembers';
import type { FolderView, ProfileReader, UnitContext } from './types';

/** What every stack's detector gets for one folder (types.ts UnitContext). */
export function unitContext(o: {
  folder: FolderView;
  top: FolderView;
  reader: ProfileReader;
  tools: WorkspaceTool[];
}): UnitContext {
  const { folder, reader } = o;
  return {
    folder,
    top: o.top,
    reader,
    read: (name) => reader.read(folder.dir ? `${folder.dir}/${name}` : name),
    memberOf(names) {
      const fits = o.tools.filter(
        (t) => names.includes(t.tool) && matchesMembers({ root: t.dir, patterns: t.members, dir: folder.dir }),
      );
      // the closest workspace above it: the longest folder
      return fits.sort((a, b) => b.dir.length - a.dir.length)[0];
    },
  };
}
