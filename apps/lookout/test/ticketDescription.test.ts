import { expect, test } from 'vitest';
import { ticketDescription } from '../src/features/inspector/ticketDescription';

test('the description drops the trailing trail line and nothing else', () => {
  expect(ticketDescription('Count sync failures by cause.\n\nPart of trail #1.')).toBe('Count sync failures by cause.');
  expect(ticketDescription('Part of trail ENG-12.')).toBe('');
  expect(ticketDescription('Part of trail #1 is done.\n\nMore to do.')).toBe(
    'Part of trail #1 is done.\n\nMore to do.',
  );
});
