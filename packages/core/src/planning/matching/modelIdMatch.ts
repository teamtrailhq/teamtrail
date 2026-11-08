/** Whether `id` matches `pattern`, where `*` stands for any run of characters. Case-insensitive, whole id. */
export function modelIdMatch(pattern: string, id: string): boolean {
  const body = pattern
    .trim()
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}$`, 'i').test(id.trim());
}
