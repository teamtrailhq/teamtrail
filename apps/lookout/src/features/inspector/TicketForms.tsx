import type { LookoutApi } from '../../hooks';
import { ReasonForm } from '../verification';
import { RemoveWorkspaceForm } from '../workspaces';
import { ResolveForm } from './ResolveForm';
import { RuleOutForm } from './RuleOutForm';
import type { Form } from './types';
import type { ReasonRequest } from './useTicketActions';
import type { TicketView } from './useTicketView';

/** The form an action in the bar opened: resolve, rule out, a reasoned override, or removing a worktree. */
export function TicketForms(props: {
  form: Form;
  setForm: (form: Form) => void;
  v: TicketView;
  actions: LookoutApi['actions'];
  act: (req: ReasonRequest) => Promise<unknown>;
}) {
  const { form, v, actions } = props;
  const close = () => props.setForm(null);
  switch (form) {
    case 'resolve':
      return (
        <ResolveForm
          onResolve={(answer, extra) => {
            void actions.resolve(v.t.id, answer, extra);
            close();
          }}
          onCancel={close}
        />
      );
    case 'rule':
      return (
        <RuleOutForm
          onRuleOut={(reason) => {
            void actions.ruleOut({ ticketId: v.t.id }, reason);
            close();
          }}
          onCancel={close}
        />
      );
    case 'rework':
    case 'accept':
    case 'unblock':
      return (
        <ReasonForm
          kind={form}
          onSubmit={(req) => {
            void props.act(req);
            close();
          }}
          onCancel={close}
        />
      );
    case 'workspace':
      return v.workspace ? (
        <RemoveWorkspaceForm workspace={v.workspace} onRemove={v.removeWorkspace} onCancel={close} />
      ) : null;
    case null:
      return null;
    default: {
      const never: never = form;
      return never;
    }
  }
}
