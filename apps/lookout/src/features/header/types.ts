import type { FocusState } from '@teamtrail/core';
import type { ReactNode } from 'react';

/** Focus on a phone, where it is the top of the header's More menu: its state (for the dot) and its panel. */
export interface PhoneFocus {
  state: FocusState['kind'];
  panel: (close: () => void) => ReactNode;
}
