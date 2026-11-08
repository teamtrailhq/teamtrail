import { cx } from '../../lib';
import { useRoles } from './useRoles';

/** A ticket's role on its map sign, above the board; quietly marked when agents can't use it now. */
export function RoleNodeTag(props: { id: string }) {
  const { view, find } = useRoles();
  const r = find(props.id);
  const off = view !== undefined && view !== null && r?.status !== 'active';
  return (
    <text className={cx('role-chip', 'role-tag', off && 'off')} data-role-id={props.id} x={2} y={-5}>
      <title>{off ? `${props.id}: ${r?.reason ?? 'not installed'}` : `Role: ${r?.role?.name ?? props.id}`}</title>
      {r?.role?.name ?? props.id}
    </text>
  );
}
