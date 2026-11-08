import { cx } from '../../lib';
import { useRoles } from './useRoles';

/** The role a ticket asks for. Quietly marked when agents can't use it now (not approved, changed, invalid). */
export function RoleChip(props: { id: string }) {
  const { view, find } = useRoles();
  const r = find(props.id);
  const off = view !== undefined && view !== null && r?.status !== 'active';
  const name = r?.role?.name ?? props.id;
  const tip = off ? `${name}: ${r?.reason ?? 'not installed'}` : `Role: ${name}`;
  return (
    <span className={cx('role-chip', off && 'off')} data-role-id={props.id} title={tip}>
      {name}
    </span>
  );
}
