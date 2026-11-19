import type { RepoUnit, WorkspaceTool, WorkspaceToolName } from '../model/repoProfile';

/** One folder the walk listed: its repo-relative path ('' for the top) and the names of its files and folders. */
export interface FolderView {
  dir: string;
  depth: number;
  files: Set<string>;
  dirs: Set<string>;
}

/** Reads for the profile, within its limits, remembering what was read for the profile's basis. */
export interface ProfileReader {
  /** A file's text by repo-relative path; undefined when missing, too large, or past the read limit. */
  read(rel: string): Promise<string | undefined>;
  /** Counts something seen (a listing) toward the basis. */
  note(line: string): void;
  /** Marks that a limit cut something short. */
  cut(): void;
  readonly truncated: boolean;
  /** sha256 of every listing noted and every file read (by path), so it changes only when they do. */
  basis(): Promise<string>;
}

/** What a stack's detector gets for one folder: the folder, a reader, and the top folder for pins kept there. */
export interface UnitContext {
  folder: FolderView;
  top: FolderView;
  reader: ProfileReader;
  /** The text of a file in this folder. */
  read(name: string): Promise<string | undefined>;
  /** The closest workspace of one of these tools that names this folder as a member, if any. */
  memberOf(tools: WorkspaceToolName[]): WorkspaceTool | undefined;
}

/** Finds the units of one stack in a folder (most find at most one). */
export type UnitDetector = (ctx: UnitContext) => Promise<RepoUnit[]>;
