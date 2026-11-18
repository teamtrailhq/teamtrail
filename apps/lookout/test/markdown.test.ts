import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from '../src/components/ui/Markdown';
import { MdText } from '../src/components/ui/MdText';
import { parseInline, parseMarkdown } from '../src/lib/markdown';

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));
const inline = (text: string) => renderToStaticMarkup(createElement(MdText, { text }));

describe('parseMarkdown', () => {
  it('reads a discovery brief as agents write it: a paragraph, then a list of bold labels', () => {
    const blocks = parseMarkdown(
      'Investigate first, then call `submit_brief`.\n\n- **Summary**: what changes.\n- **Risks** and regressions.',
    );
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list']);
    const list = blocks[1];
    expect(list.kind === 'list' && list.items.length).toBe(2);
  });

  it('nests lists by indent, numbers ordered ones from their start, keeps blank lines between items', () => {
    const [list] = parseMarkdown('3. one\n   - a\n   - b\n\n4. two');
    expect(list).toMatchObject({ kind: 'list', ordered: true, start: 3 });
    expect(list.kind === 'list' && list.items.length).toBe(2);
    expect(list.kind === 'list' && list.items[0][1]).toMatchObject({ kind: 'list', ordered: false });
  });

  it('reads fenced code as it is, headings, quotes and rules', () => {
    const blocks = parseMarkdown('## Plan\n\n```ts\nconst a = 1;\n**not bold**\n```\n\n> quoted\n\n---');
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, text: 'Plan' },
      { kind: 'code', text: 'const a = 1;\n**not bold**' },
      { kind: 'quote', blocks: [{ kind: 'paragraph', text: 'quoted' }] },
      { kind: 'rule' },
    ]);
  });

  it('stops nesting at a depth: deep quotes end as text, never a stack overflow', () => {
    expect(() => parseMarkdown(`${'>'.repeat(5000)} deep`)).not.toThrow();
    expect(() =>
      parseMarkdown(Array.from({ length: 2000 }, (_, i) => `${' '.repeat(i * 2)}- x`).join('\n')),
    ).not.toThrow();
  });
});

describe('parseInline', () => {
  it('reads code, strong, em, struck text and escapes', () => {
    expect(parseInline('`a*b*` **bold** *em* ~~old~~ \\*literal\\*')).toEqual([
      { kind: 'code', text: 'a*b*' },
      { kind: 'text', text: ' ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'bold' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'em' }] },
      { kind: 'text', text: ' ' },
      { kind: 'del', children: [{ kind: 'text', text: 'old' }] },
      { kind: 'text', text: ' *literal*' },
    ]);
  });

  it('leaves snake_case, a lone asterisk and unclosed marks as they are', () => {
    expect(parseInline('sync_failures_table and 2 * 3 and **open')).toEqual([
      { kind: 'text', text: 'sync_failures_table and 2 * 3 and **open' },
    ]);
  });

  it('links only http(s) URLs; any other scheme keeps its label as text', () => {
    expect(parseInline('[docs](https://example.com/a)')).toEqual([
      { kind: 'link', href: 'https://example.com/a', children: [{ kind: 'text', text: 'docs' }] },
    ]);
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ kind: 'text', text: 'click' }]);
    expect(parseInline('[x](data:text/html,hi)')).toEqual([{ kind: 'text', text: 'x' }]);
  });

  it('links bare URLs without their trailing punctuation, and no link inside a link', () => {
    expect(parseInline('See https://example.com/x.')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'link', href: 'https://example.com/x', children: [{ kind: 'text', text: 'https://example.com/x' }] },
      { kind: 'text', text: '.' },
    ]);
    const [link] = parseInline('[https://a.example](https://b.example)');
    expect(link).toEqual({
      kind: 'link',
      href: 'https://b.example',
      children: [{ kind: 'text', text: 'https://a.example' }],
    });
  });
});

describe('Markdown', () => {
  it('renders lists, bold, code and links as elements, links opening in a new tab without a referrer', () => {
    const out = html('Read `a.ts`.\n\n- **One**\n- [Two](https://example.com)');
    expect(out).toContain('<code class="md-code">a.ts</code>');
    expect(out).toContain('<ul><li><p><span><strong>One</strong></span></p></li>');
    expect(out).toContain('<a href="https://example.com" target="_blank" rel="noreferrer noopener">Two</a>');
  });

  it('never renders HTML, loads an image or keeps a script: they are text', () => {
    const out = html(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n![a chart](https://evil.example/x.png)',
    );
    expect(out).not.toMatch(/<script|<img|evil\.example/);
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).toContain('a chart');
  });

  it('shows one line of inline markdown, as a criterion is', () => {
    expect(inline('Returns `404` for a **missing** note')).toBe(
      '<span>Returns <code class="md-code">404</code> for a <strong>missing</strong> note</span>',
    );
  });
});
