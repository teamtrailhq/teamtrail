/** A long question's card: its headline in bold, then the question in full, its line breaks kept, all escaped. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { askClosedMessage, askMessage, replyModal } from '../src/blocks';

const here = path.dirname(fileURLToPath(import.meta.url));
const LONG = readFileSync(path.join(here, '../../../scripts/fixtures/long-question.md'), 'utf8');
const ask = { sessionId: 's', questionId: 'q', text: LONG, agent: 'claude-01' };
const sectionText = (m: { blocks: unknown[] }) => (m.blocks[0] as { text: { text: string } }).text.text;

test("a long question leads with the agent's summary, then quotes the question with its paragraphs", () => {
  const m = askMessage({ ...ask, summary: 'Card images: an API key or a <!channel> list?' });
  const [header, title, ...body] = sectionText(m).split('\n');
  assert.match(header, /AWAITING YOU/);
  assert.equal(title, '*Card images: an API key or a &lt;!channel&gt; list?*');
  assert.ok(
    body.every((l) => l.startsWith('>')),
    'the question is one quote',
  );
  assert.ok(body.includes('>'), 'its blank lines between paragraphs stay');
  assert.ok(body.some((l) => l.startsWith('>A) Fetch')) && body.some((l) => l.startsWith('>B) Ship')));
  assert.equal(m.text, 'Awaiting you · claude-01: Card images: an API key or a &lt;!channel&gt; list?');
});

test('without a summary the first sentence is the title; a short question is said once', () => {
  assert.equal(sectionText(askMessage(ask)).split('\n')[1], '*The card grid needs a picture for every card it shows.*');
  const short = sectionText(askMessage({ ...ask, text: 'Tabs or spaces?' }));
  assert.equal(short.split('\n').length, 2);
  assert.equal(short.split('\n')[1], '*Tabs or spaces?*');
  const closed = sectionText(askClosedMessage(ask, 'Answered'));
  assert.match(closed, /^◇ \*ANSWERED\*.*\n\*The card grid needs/);
  const modal = replyModal(ask, '{}') as { blocks: { text?: { text: string } }[] };
  assert.match(modal.blocks[1].text!.text, /^\*The card grid needs.*\n>The card grid/);
});
