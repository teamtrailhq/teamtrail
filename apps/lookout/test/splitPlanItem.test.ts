import { expect, test } from 'vitest';
import { splitPlanItem } from '../src/features/plan/splitPlanItem';

test('a plan line splits into its ticket key, title and reason', () => {
  expect(splitPlanItem('#14 End-to-end encryption — separate initiative')).toEqual({
    key: '#14',
    title: 'End-to-end encryption',
    reason: 'separate initiative',
  });
  expect(splitPlanItem('Web client offline support — mobile first')).toEqual({
    key: undefined,
    title: 'Web client offline support',
    reason: 'mobile first',
  });
  expect(splitPlanItem('Attachments and photo sync')).toEqual({
    key: undefined,
    title: 'Attachments and photo sync',
    reason: undefined,
  });
});
