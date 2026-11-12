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
