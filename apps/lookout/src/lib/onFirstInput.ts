/** What counts as the person starting to use the page: a press of a pointer (mouse, pen, touch) or a key. */
const INPUTS = ['pointerdown', 'keydown'] as const;
const CAPTURE = { capture: true };

/**
 * Calls `then` once, at the person's first pointer press or key on `target`, before anything on the page handles it
 * (capture phase). Returns a function that stops listening.
 */
export function onFirstInput(target: EventTarget, then: () => void): () => void {
  function stop() {
    for (const type of INPUTS) target.removeEventListener(type, heard, CAPTURE);
  }
  function heard() {
    stop();
    then();
  }
  for (const type of INPUTS) target.addEventListener(type, heard, CAPTURE);
  return stop;
}
