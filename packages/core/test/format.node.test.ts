import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decisionComment, parseDecisionComment } from '../src/adapters/remote/decisionComment';
import { authoredBody, joinBody, readComment, splitBody, typeFromLabels } from '../src/adapters/remote/format';
import { readIssueComments } from '../src/adapters/remote/issueMapping';
import type { Writer } from '../src/adapters/remote/writer';
import { buildDecision } from '../src/planning/decisions/decisionRecord';

const SELF: Writer = { kind: 'self', name: 'octo-dev' };

test('claim marker round-trips and disappears when released', () => {
  const body = joinBody('Compare libraries.', { assignee: 'claude-07' });
  assert.match(body, /<!-- teamtrail:meta \{"assignee":"claude-07"\} -->$/);
  assert.deepEqual(splitBody(body), { text: 'Compare libraries.', meta: { assignee: 'claude-07' } });
  assert.equal(joinBody('Compare libraries.', { assignee: undefined }), 'Compare libraries.');
  assert.deepEqual(splitBody('Edited by hand\r\n\r\n<!-- teamtrail:meta {broken -->'), {
    text: 'Edited by hand\n\n<!-- teamtrail:meta {broken -->',
    meta: {},
  });
});

test('comment author marker is read back; plain tracker comments keep the tracker user', () => {
  assert.deepEqual(readComment({ id: '1', body: authoredBody('claude-07', 'Found it.'), writer: SELF, createdAt: 0 }), {
    id: '1',
    author: 'claude-07',
    body: 'Found it.',
    createdAt: 0,
  });
  assert.equal(
    readComment({
      id: '2',
      body: 'LGTM',
      writer: { kind: 'outsider', name: 'mona' },
      createdAt: '2026-10-31T12:00:00Z',
    }).author,
    'mona',
  );
});

test('the write id of a queued comment is hidden from its body and read back', () => {
  const body = authoredBody('claude-07', 'Found it.', 'mvwc1a2b');
  assert.match(body, /^<!-- teamtrail:author claude-07 -->\n<!-- teamtrail:write mvwc1a2b -->\nFound it\.$/);
  assert.deepEqual(readComment({ id: '3', body, writer: SELF, createdAt: 0 }), {
    id: '3',
    author: 'claude-07',
    body: 'Found it.',
    createdAt: 0,
    writeId: 'mvwc1a2b',
  });
});

test('decision comments survive text that would close an HTML comment', () => {
  const d = buildDecision('D-7', 'm', {
    question: 'Q?',
    answer: 'Use --> arrows <!-- and --> dashes.',
    decidedBy: 'trail lead',
    source: { kind: 'lookout' },
    ticketId: '12',
    ticketKey: '#12',
  });
  const body = decisionComment(d);
  const shown = readIssueComments('m', [{ id: 'x', body, writer: SELF, createdAt: '' }], () => {});
  assert.deepEqual(shown, [], 'not shown as conversation');
  assert.deepEqual(parseDecisionComment(body), d);
});

test('oversized transcripts are trimmed to fit a tracker comment', () => {
  const long = 'x'.repeat(4000);
  const d = buildDecision('D-1', 'm', {
    question: 'Q',
    answer: 'A long enough answer for a summary.',
    decidedBy: 'op',
    source: { kind: 'agent' },
    transcript: Array.from({ length: 40 }, (_, i) => ({ from: 'agent' as const, author: 'a', text: long, at: i })),
  });
  const body = decisionComment(d);
  assert.ok(body.length < 60_000);
  assert.ok(parseDecisionComment(body)!.transcript.length < 40);
});

test('ticket type comes from labels, defaulting to task', () => {
  assert.equal(typeFromLabels(['bug', 'teamtrail:junction']), 'junction');
  assert.equal(typeFromLabels(['bug']), 'task');
});
