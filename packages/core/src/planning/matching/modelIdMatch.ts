import { wildcardMatch } from '../../model/wildcard';

/** Whether `id` matches `pattern`, where `*` stands for any run of characters. Case-insensitive, whole id. */
export function modelIdMatch(pattern: string, id: string): boolean {
  return wildcardMatch(pattern.trim().toLowerCase(), id.trim().toLowerCase(), { segments: false });
}
