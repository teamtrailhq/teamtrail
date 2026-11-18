import type { ReactNode } from 'react';
import type { LookoutApi } from '../../hooks';
import { cx } from '../../lib';
import { ActionBar } from './ActionBar';
import { TicketForms } from './TicketForms';
import type { Form } from './types';
import type { useTicketActions } from './useTicketActions';
import type { TicketView } from './useTicketView';

/**
 * The end of a ticket, in its bubble and the full ticket alike: everything the human can do on it, the next action
 * first and the rest under "⋯", with the form an action opened just above. `trailing` ends the row (the bubble's
 * Full ticket). Nothing when there is nothing to do.
 */
export function TicketFooter(props: {
  v: TicketView;
  bar: ReturnType<typeof useTicketActions>;
  form: Form;
  setForm: (form: Form) => void;
  actions: LookoutApi['actions'];
  onOpenChat: (sessionId: string) => void;
  trailing?: ReactNode;
  className?: string;
}) {
  const { v, bar } = props;
  const idle = !bar.primary && !bar.menu.length && !v.session && !v.proof && !props.form && !props.trailing;
  if (idle && !bar.error && !bar.note) return null;
  return (
    <footer className={cx('ticket-footer', props.className)}>
      <TicketForms
        form={props.form}
        setForm={props.setForm}
        v={v}
        actions={props.actions}
        act={bar.act}
        waive={bar.waive}
      />
      <ActionBar v={v} bar={bar} onOpenChat={props.onOpenChat} trailing={props.trailing} />
    </footer>
  );
}
