import type { UnitReadiness } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { folderName, unitContext, unitNeeds } from './readinessText';

/** Each folder the repo is made of: its stack and lockfile, and what it needs here, met or not. */
export function UnitList(props: { units: UnitReadiness[] }) {
  if (!props.units.length) return null;
  return (
    <ul className="rd-list">
      {props.units.map((u) => {
        const needs = unitNeeds(u);
        return (
          <Row
            key={u.dir}
            as="li"
            title={<span className={u.dir ? 't-code' : undefined}>{folderName(u.dir)}</span>}
            context={<MetaLine parts={unitContext(u)} />}
            detail={needs || undefined}
            detailText={needs}
          />
        );
      })}
    </ul>
  );
}
