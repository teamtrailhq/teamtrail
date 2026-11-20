import type { AttentionItem, GapStanding, Proof, TicketSync } from '@teamtrail/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MenuItem } from '../src/components/ui';
import { gapActionList } from '../src/features/inspector/gapActionList';
import { mergeAction } from '../src/features/inspector/mergeAction';
import { needAction } from '../src/features/inspector/needAction';
import { needPrimary } from '../src/features/inspector/needPrimary';
import { MergeForm } from '../src/features/proof/MergeForm';
import { mergeOffer } from '../src/features/proof/mergeOffer';

const proof = (patch: Partial<Proof> = {}) =>
  ({
    status: 'not-verified',
    gaps: ['No completion was submitted for this ticket.'],
    attempt: { id: '' },
    ...patch,
  }) as unknown as Proof;
const work = { attempt: { id: 'A-1' }, git: { head: 'abc', branch: 'teamtrail/m/2' } } as Partial<Proof>;
const unverified = proof({ ...work, gaps: ['test didn’t run: Ada accepted the work without it.'] });
const offer = (p: Proof, prState?: string, done = true) => mergeOffer({ path: '/merge', done, proof: p, prState });
const noop = () => {};

describe('mergeOffer: when a done ticket’s pull request can be merged here', () => {
  it('only behind a server that merges, on a done ticket with a completion on a branch and a commit', () => {
    expect(mergeOffer({ done: true, proof: unverified })).toBeUndefined();
    expect(offer(unverified, undefined, false)).toBeUndefined();
    expect(offer(proof())).toBeUndefined();
    expect(offer(unverified)).toEqual({ kind: 'anyway', path: '/merge', gaps: unverified.gaps });
    expect(offer(proof({ ...work, status: 'verified', gaps: [] }))?.kind).toBe('approve');
  });

  it('with no commit in the proof, Merge anyway at the open pull request’s head, and only then', () => {
    const unchecked = proof({ gaps: ['Finished with no checks set: nothing was checked.'] });
    const at = (prState?: string, prHead?: string) =>
      mergeOffer({ path: '/merge', done: true, proof: unchecked, prState, prHead });
    expect(at('open', 'f00d')).toEqual({ kind: 'anyway', path: '/merge', gaps: unchecked.gaps, head: 'f00d' });
    expect(at(undefined, undefined)).toBeUndefined();
    expect(at('open', undefined)).toBeUndefined();
    expect(at('merged', 'f00d')).toBeUndefined();
    // a proof that names its commit merges at it, whatever the pull request's head
    expect(mergeOffer({ path: '/merge', done: true, proof: unverified, prState: 'open', prHead: 'f00d' })?.head).toBe(
      undefined,
    );
  });

  it('never for a pull request PR sync says is merged or closed', () => {
    expect(offer(unverified, 'open')?.kind).toBe('anyway');
    expect(offer(unverified, 'merged')).toBeUndefined();
    expect(offer(unverified, 'closed')).toBeUndefined();
  });
});

describe('the merge action', () => {
  it('is Approve and merge when verified, Merge anyway… with the first gap when not, and opens its question', () => {
    const forms: string[] = [];
    const run = { form: (f: string) => void forms.push(f) };
    expect(mergeAction(undefined, run)).toBeUndefined();
    expect(mergeAction({ kind: 'approve', path: '/merge', gaps: [] }, run)?.label).toBe('Approve and merge');
    const anyway = mergeAction(offer(unverified), run)!;
    expect(anyway.label).toBe('Merge anyway…');
    expect(anyway.tip).toContain('test didn’t run');
    anyway.onSelect();
    expect(forms).toEqual(['merge']);
  });

  it('is what the merge item in the queue leads to, else its pull request', () => {
    const item = {
      id: 'x',
      kind: 'merge',
      title: '#2: PR #7 ready to merge',
      mapId: 'm',
      ticketId: '2',
    } as AttentionItem;
    const pr = { pr: { url: 'https://github.com/acme/app/pull/7' } } as TicketSync;
    const merge: MenuItem = { id: 'merge', label: 'Merge anyway…', onSelect: noop };
    expect(needAction('merge')?.act).toMatchObject({ kind: 'menu', id: 'merge' });
    expect(needPrimary({ v: { items: [item], pr }, all: [merge] })).toBe(merge);
    expect(needPrimary({ v: { items: [item], pr }, all: [] })?.label).toBe('Open the PR');
    expect(needPrimary({ v: { items: [item] }, all: [] })).toBeUndefined();
  });
});

describe('the merge question', () => {
  const plan: GapStanding[] = [
    { kind: 'waived-check', text: unverified.gaps[0], owner: 'accepted', status: 'Accepted without it.' },
  ];
  const render = (o: ReturnType<typeof offer>) =>
    renderToStaticMarkup(createElement(MergeForm, { offer: o, mapId: 'm', ticketId: '2', plan, onClose: noop }));

  it('asks once, with the gaps it accepts, for Merge anyway', () => {
    const html = render(offer(unverified));
    expect(html).toContain('Merge without a verified proof?');
    expect(html).toContain('>Merge anyway<');
    expect(html).toContain('Not verified: test didn’t run');
    expect(html).toContain('Cancel');
  });

  it('names the pull request’s head it accepts when the proof names no commit', () => {
    const html = render({ kind: 'anyway', path: '/merge', gaps: unverified.gaps, head: 'e'.repeat(40) });
    expect(html).toContain('Its proof names no commit, so you accept the pull request as it is now, at head');
    expect(html).toContain(`<code title="${'e'.repeat(40)}">${'e'.repeat(12)}</code>`);
    expect(html).toContain('>Merge anyway<');
  });

  it('asks for the verified commit for Approve and merge, and is nothing with no offer', () => {
    expect(render({ kind: 'approve', path: '/merge', gaps: [] })).toContain('exactly the commit Teamtrail verified');
    expect(render(undefined)).toBe('');
  });
});

describe('a done ticket finished with no checks set', () => {
  it('offers Set checks, which opens Settings → Verification', () => {
    const gap: GapStanding = {
      kind: 'finished-unchecked',
      text: 'Finished with no checks set: nothing was checked.',
      owner: 'you',
      status: 'Needs you: set the checks finished work is held to.',
      action: 'set-checks',
    };
    const opened: string[] = [];
    const run = { confirm: noop, verifyAgain: noop, setChecks: () => void opened.push('verification') };
    const item = gapActionList([gap], [], run).get('set-checks');
    expect(item?.label).toBe('Set checks');
    item?.onSelect();
    expect(opened).toEqual(['verification']);
    expect(gapActionList([gap], [], { confirm: noop, verifyAgain: noop }).size).toBe(0);
  });
});
