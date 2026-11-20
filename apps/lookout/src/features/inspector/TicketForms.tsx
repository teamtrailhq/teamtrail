import { heldAsFlaky, type WaivableCheck } from '@teamtrail/core';
import type { LookoutApi } from '../../hooks';
import { MergeForm } from '../proof';
import { ReasonForm, WaiveForm } from '../verification';
import { RemoveWorkspaceForm } from '../workspaces';
import { ResolveForm } from './ResolveForm';
import { RuleOutForm } from './RuleOutForm';
import type { Form } from './types';
import type { ReasonRequest } from './useTicketActions';
import type { TicketView } from './useTicketView';

/** The latest completion's checks passed and the check guard holds the pass. */
const guarded = (v: TicketView) => {
  const a = v.verification?.attempts[0];
  return a?.result === 'pass' && a.guard?.mode === 'enforce';
};

/** The form an action in the bar opened: resolve, rule out, a reasoned override, a merge, or removing a worktree. */
export function TicketForms(props: {
  form: Form;
  setForm: (form: Form) => void;
  v: TicketView;
  actions: LookoutApi['actions'];
  act: (req: ReasonRequest) => Promise<unknown>;
  waive: (req: { checks: WaivableCheck[]; reason: string }) => Promise<unknown>;
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
          retried={v.state === 'held' && heldAsFlaky(v.verification?.attempts[0])}
          guarded={guarded(v)}
          onSubmit={(req) => {
            void props.act(req);
            close();
          }}
          onCancel={close}
        />
      );
    case 'waive':
      return (
        <WaiveForm
          waivable={v.verification?.waivable ?? []}
          results={v.verification?.attempts[0]?.checks ?? []}
          onSubmit={(req) => {
            void props.waive(req);
            close();
          }}
          onCancel={close}
        />
      );
    case 'merge':
      return <MergeForm offer={v.merge} mapId={v.snap.map.id} ticketId={v.t.id} plan={v.proof?.plan} onClose={close} />;
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
