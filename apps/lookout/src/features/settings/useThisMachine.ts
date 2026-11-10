import { useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';

/**
 * Whether this page is open on the machine Teamtrail runs on. From another device on the network the Lookout
 * reads, answers and approves, but the settings that change what runs on that machine, or whom it trusts, are
 * refused there. undefined until known (and without a server), so nothing flashes.
 */
export function useThisMachine() {
  const [local, setLocal] = useState<boolean>();
  useEffect(() => {
    fetch(`${apiBase()}/machine`)
      .then((r) => (r.ok ? (r.json() as Promise<{ local?: boolean }>) : undefined))
      .then(
        (m) => setLocal(m?.local),
        () => setLocal(undefined),
      );
  }, []);
  return local;
}
