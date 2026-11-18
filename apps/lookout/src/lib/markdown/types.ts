/**
 * Agent-written markdown, parsed into a few safe shapes. There is no raw HTML node and no image node: HTML stays
 * text, an image shows as its alt text, and a link carries only a URL `webUrl` accepted (else it is plain text).
 */
export type MdInline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: MdInline[] }
  | { kind: 'em'; children: MdInline[] }
  | { kind: 'del'; children: MdInline[] }
  | { kind: 'link'; href: string; children: MdInline[] }
  | { kind: 'break' };

/** A block of a ticket body or comment. Paragraph and heading text is inline markdown, parsed when shown. */
export type MdBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: MdBlock[][] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; blocks: MdBlock[] }
  | { kind: 'rule' };
