import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { DoneStrip, LabelLine, Row, SavedNote, SceneCard, StatusMark, StepTrack } from '../src/components/ui';
import { labelParts } from '../src/lib/labelParts';
import { stepStates } from '../src/lib/stepStates';

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

describe('label parts', () => {
  test('skips empty and missing parts, keeps order, plain strings take the line’s tone', () => {
    expect(labelParts(['Question', false, '', null, { text: '#6' }, undefined, { text: '' }])).toEqual([
      { text: 'Question', tone: 'plain' },
      { text: '#6', tone: 'plain', tip: undefined },
    ]);
  });

  test('a part keeps its own tone and tip', () => {
    expect(labelParts([{ text: 'claude-02', tone: 'agent', tip: 'Opus' }])).toEqual([
      { text: 'claude-02', tone: 'agent', tip: 'Opus' },
    ]);
  });
});

describe('step states', () => {
  test('steps before the current one are done, it is now, the rest ahead', () => {
    expect(stepStates({ step: 3, total: 5 })).toEqual(['done', 'done', 'now', 'todo', 'todo']);
  });

  test('past the end all are done; under 1 none are', () => {
    expect(stepStates({ step: 9, total: 3 })).toEqual(['done', 'done', 'done']);
    expect(stepStates({ step: 0, total: 2 })).toEqual(['todo', 'todo']);
  });

  test('a total that isn’t a whole number from 0 up is read as such, never throws', () => {
    expect(stepStates({ step: 1, total: -2 })).toEqual([]);
    expect(stepStates({ step: 1, total: Number.NaN })).toEqual([]);
    expect(stepStates({ step: 2.7, total: 3.9 })).toEqual(['done', 'now', 'todo']);
  });
});

describe('scene primitives render', () => {
  test('a label line joins parts with " · ", tones the line and parts, and ends with the cursor', () => {
    const out = html(
      createElement(LabelLine, {
        parts: ['Question', { text: 'claude-02', tone: 'agent' }],
        tone: 'urgent',
        cursor: true,
      }),
    );
    expect(out).toContain('ds-label tone-urgent');
    expect(out).toContain('<span class="ds-label-sep"> · </span>');
    expect(out).toContain('<span class="tone-agent">claude-02</span>');
    expect(out).toContain('ds-cursor blink');
  });

  test('a label line with nothing to show renders nothing', () => {
    expect(html(createElement(LabelLine, { parts: [false, ''] }))).toBe('');
  });

  test('the step track names where it is for screen readers and renders nothing for no steps', () => {
    const out = html(createElement(StepTrack, { step: 2, total: 4 }));
    expect(out).toContain('aria-label="Step 2 of 4"');
    expect(out.match(/<i class="done"><\/i>/g)).toHaveLength(1);
    expect(html(createElement(StepTrack, { step: 1, total: 0 }))).toBe('');
  });

  test('a status mark shows its number only as a number mark, and is hidden unless labelled', () => {
    expect(html(createElement(StatusMark, { kind: 'number', n: 3 }))).toContain('>3<');
    expect(html(createElement(StatusMark, { kind: 'done', n: 3 }))).not.toContain('>3<');
    expect(html(createElement(StatusMark, { kind: 'rework' }))).toContain('aria-hidden="true"');
    expect(html(createElement(StatusMark, { kind: 'held', label: 'Held for you' }))).toContain(
      'aria-label="Held for you"',
    );
  });

  test('a row with a label and an action puts the label above the title and the action on the right', () => {
    const out = html(
      createElement(Row, {
        label: createElement(LabelLine, { parts: ['Question', '#6'] }),
        title: 'Merge shared edits?',
        action: createElement('button', null, 'Answer'),
      }),
    );
    expect(out).toContain('ds-row edge-neutral has-action');
    expect(out.indexOf('ds-row-label')).toBeLessThan(out.indexOf('ds-row-title'));
    expect(out).toContain('<span class="ds-row-action"><button>Answer</button></span>');
  });

  test('a row without them renders as before', () => {
    const out = html(createElement(Row, { title: 'T' }));
    expect(out).not.toContain('has-action');
    expect(out).not.toContain('ds-row-label');
  });

  test('a scene card has its head, body and foot, and leaves out what it isn’t given', () => {
    const full = html(
      createElement(
        SceneCard,
        { headline: 'Gates', help: 'How each gate acts.', foot: 'f' },
        createElement('p', null, 'b'),
      ),
    );
    expect(full).toContain('<h3 class="ds-scard-headline">Gates</h3>');
    expect(full).toContain('ds-scard-help');
    expect(full).toContain('ds-scard-foot');
    const bare = html(createElement(SceneCard, null, 'b'));
    expect(bare).not.toContain('ds-scard-head');
    expect(bare).not.toContain('ds-scard-foot');
  });

  test('the done strip and the saved note speak in green, and the note keeps its place while hidden', () => {
    const strip = html(createElement(DoneStrip, { label: ['Answered', 'D-21', 'Alex Rivera'] }, 'Merge them.'));
    expect(strip).toContain('tone-ok');
    expect(strip).toContain('role="status"');
    expect(strip).toContain('Merge them.');
    const hidden = html(createElement(SavedNote, { shown: false, parts: ['Saved', 'journaled'] }));
    expect(hidden).toContain('class="ds-saved"');
    expect(hidden).toContain('aria-hidden="true"');
    expect(html(createElement(SavedNote, { shown: true }))).toContain('ds-saved on');
  });
});
