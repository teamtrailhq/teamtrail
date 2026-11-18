import { describe, expect, it, vi } from 'vitest';
import { onFirstInput } from '../src/lib/onFirstInput';

describe('onFirstInput', () => {
  it('hears the first pointer press once, and not the presses and keys after it', () => {
    const page = new EventTarget();
    const heard = vi.fn();
    onFirstInput(page, heard);
    page.dispatchEvent(new Event('pointerdown'));
    page.dispatchEvent(new Event('keydown'));
    page.dispatchEvent(new Event('pointerdown'));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('listens in the capture phase, so it hears a press before the handlers on the page', () => {
    const page = new EventTarget();
    const add = vi.spyOn(page, 'addEventListener');
    onFirstInput(page, () => {});
    expect(add.mock.calls.map(([type, , options]) => [type, options])).toEqual([
      ['pointerdown', { capture: true }],
      ['keydown', { capture: true }],
    ]);
  });

  it('counts a key as much as a press', () => {
    const page = new EventTarget();
    const heard = vi.fn();
    onFirstInput(page, heard);
    page.dispatchEvent(new Event('keydown'));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('hears nothing once stopped, and nothing but presses and keys', () => {
    const page = new EventTarget();
    const heard = vi.fn();
    onFirstInput(page, heard)();
    page.dispatchEvent(new Event('pointerdown'));
    onFirstInput(page, heard);
    page.dispatchEvent(new Event('pointermove'));
    page.dispatchEvent(new Event('scroll'));
    expect(heard).not.toHaveBeenCalled();
  });
});
