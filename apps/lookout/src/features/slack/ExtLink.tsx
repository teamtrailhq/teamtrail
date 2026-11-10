import { webUrl } from '@teamtrail/core';
import type { ReactNode } from 'react';

export function ExtLink(props: { href?: string; children: ReactNode; primary?: boolean; onClick?: () => void }) {
  return (
    <a
      className={`btn ${props.primary ? 'primary' : ''}`}
      href={webUrl(props.href, ['slack:'])}
      target="_blank"
      rel="noreferrer"
      onClick={props.onClick}
    >
      {props.children}
    </a>
  );
}
