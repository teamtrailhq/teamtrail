import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mentionCommand } from '../src/service/mentionCommand';

test('the first known word anywhere in what was written is the command, case and punctuation ignored', () => {
  assert.deepEqual(mentionCommand('<@U0SCOUT> whats in the inbox?'), { sub: 'inbox', arg: '' });
  assert.deepEqual(mentionCommand('<@U0SCOUT> inbox please'), { sub: 'inbox', arg: '' });
  assert.deepEqual(mentionCommand("What's in my Inbox?"), { sub: 'inbox', arg: '' });
  assert.deepEqual(mentionCommand('HELP!'), { sub: 'help', arg: '' });
  assert.deepEqual(mentionCommand('help me with the inbox'), { sub: 'help', arg: '' }, 'the first known word wins');
});

test('status takes the words after it as the trail, without filler words or punctuation', () => {
  assert.deepEqual(mentionCommand("<@U0SCOUT> what's the status of Slack live test?"), {
    sub: 'status',
    arg: 'Slack live test',
  });
  assert.deepEqual(mentionCommand('status slack-live-test'), { sub: 'status', arg: 'slack-live-test' });
  assert.deepEqual(mentionCommand('status #3'), { sub: 'status', arg: '#3' });
  assert.deepEqual(mentionCommand('status please'), { sub: 'status', arg: '' });
});

test('text with no known word, or nothing at all, is the empty command', () => {
  assert.deepEqual(mentionCommand('hi'), { sub: '', arg: '' });
  assert.deepEqual(mentionCommand('<@U0SCOUT>'), { sub: '', arg: '' });
  assert.deepEqual(mentionCommand('<!channel> inboxes'), { sub: '', arg: '' });
  assert.deepEqual(mentionCommand(undefined), { sub: '', arg: '' });
});

test('a ticket is asked about by its key anywhere in the text, or by the words after "ticket"', () => {
  assert.deepEqual(mentionCommand("<@U0SCOUT> what's blocking #12?"), { sub: 'ticket', arg: '#12' });
  assert.deepEqual(mentionCommand('is WAY-7 blocked'), { sub: 'ticket', arg: 'WAY-7' });
  assert.deepEqual(mentionCommand('ticket Pick DB'), { sub: 'ticket', arg: 'Pick DB' });
  assert.deepEqual(mentionCommand('#4?'), { sub: 'ticket', arg: '#4' }, 'a bare key asks about that ticket');
  assert.deepEqual(mentionCommand("what's blocked?"), { sub: 'ticket', arg: '' }, "no key: what's blocked");
  assert.deepEqual(mentionCommand('<#C0INFRA01|infra> hi'), { sub: '', arg: '' }, 'a channel link is not a key');
});

test('decisions take a trail or the words to look for; who counts only when nothing else is asked', () => {
  assert.deepEqual(mentionCommand('what did we decide about retention?'), { sub: 'decisions', arg: 'retention' });
  assert.deepEqual(mentionCommand('what was decided about retention?'), { sub: 'decisions', arg: 'retention' });
  assert.deepEqual(mentionCommand('decisions on Event store'), { sub: 'decisions', arg: 'Event store' });
  assert.deepEqual(mentionCommand('decisions'), { sub: 'decisions', arg: '' });
  assert.deepEqual(mentionCommand("who's working?"), { sub: 'who', arg: '' });
  assert.deepEqual(mentionCommand('who decided the DB?'), { sub: 'decisions', arg: 'DB' });
  assert.deepEqual(mentionCommand('who is on #3'), { sub: 'ticket', arg: '#3' });
  assert.deepEqual(mentionCommand('constructor'), { sub: '', arg: '' });
});
