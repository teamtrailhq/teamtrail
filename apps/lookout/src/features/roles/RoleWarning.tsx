import { useRoles } from './useRoles';

/** Under a ticket whose role agents can't use: why, and what it means for claims. */
export function RoleWarning(props: { id: string }) {
  const { view, find } = useRoles();
  if (!view) return null;
  const r = find(props.id);
  if (r?.status === 'active') return null;
  const why = r ? (r.reason ?? r.status) : 'it is not installed';
  return (
    <p className="role-warning t-meta">
      Role {props.id} can't be used: {why}. Claims get no role instructions until you approve it in Settings → Roles.
    </p>
  );
}
