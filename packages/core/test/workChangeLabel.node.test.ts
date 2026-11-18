import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workChangeLabel } from '../src/agents/workChangeLabel';

test('a waiting agent wakes for what can free work, never for session docs, logs or temp files', () => {
  const wakes = {
    'criteria/exports.md': 'acceptance criteria changed',
    'briefs/exports.md': 'the discovery brief changed',
    '.reroutes/exports/R-2.json': 'a reroute changed',
    'attention.json': 'the review limit changed',
    'exports/tickets/3.md': 'a ticket changed',
    'exports/map.md': 'the trail changed',
    '.evidence/_main/latest.json': 'checks on main changed',
    '.evidence/_main/runs/r1.json': 'checks on main changed',
  };
  for (const [rel, label] of Object.entries(wakes)) assert.equal(workChangeLabel(rel), label, rel);
  const quiet = [
    '.agents/sessions/s1.json',
    '.agents/leases/exports--3.json',
    '.events/exports.jsonl',
    '.evidence/exports/3/attempts/a1/check.log',
    '.evidence/_main/runs/r1/check.log',
    '.evidence/sync-status.json',
    '.attention/state.json',
    'exports/tickets/.3.md.a1b2c3.tmp',
    'criteria/exports.md.123.tmp',
    '.agents/.gitignore',
    'exports/tickets/sub/3.md',
    '',
  ];
  for (const rel of quiet) assert.equal(workChangeLabel(rel), undefined, rel);
});
