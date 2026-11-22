const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text or an attribute value made safe to put in HTML: every option a page passes goes through this. */
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
