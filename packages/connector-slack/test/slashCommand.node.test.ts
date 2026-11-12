import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slashCommand } from '../src/service/slashCommand';

test('a subcommand as the first word is taken as typed', () => {
  assert.deepEqual(slashCommand('decide Postgres it is'), { sub: 'decide', arg: 'Postgres it is' });
  assert.deepEqual(slashCommand('ticket #12'), { sub: 'ticket', arg: '#12' });
  assert.deepEqual(slashCommand('Decisions retention'), { sub: 'decisions', arg: 'retention' });
  assert.deepEqual(slashCommand('who'), { sub: 'who', arg: '' });
  assert.deepEqual(slashCommand(''), { sub: '', arg: '' });
});

test('anything else is read the way @Scout reads a message', () => {
  assert.deepEqual(slashCommand("what's blocking #12?"), { sub: 'ticket', arg: '#12' });
  assert.deepEqual(slashCommand('#12'), { sub: 'ticket', arg: '#12' });
  assert.deepEqual(slashCommand('what did we decide about retention?'), { sub: 'decisions', arg: 'retention' });
  assert.deepEqual(slashCommand("who's working?"), { sub: 'who', arg: '' });
  assert.deepEqual(slashCommand("what's in my inbox"), { sub: 'inbox', arg: '' });
});

test('text nothing in it is understood is unknown, by its first word', () => {
  assert.deepEqual(slashCommand('dance now'), { sub: 'dance', arg: '', unknown: true });
  assert.deepEqual(slashCommand('constructor'), { sub: 'constructor', arg: '', unknown: true });
});
