import { BRAND } from '@teamtrail/core';
import { useState } from 'react';
import { InputRow } from '../../components/ui';
import { projectsApi } from './projectsApi';

/** Paste a repo path to supervise it here; a `.teamtrail` folder is created in it when missing. */
export function AddProject(props: { onAdded: () => void }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState<string>();
  const add = (v: string) => {
    if (!v.trim()) return;
    setError(undefined);
    projectsApi.add(v.trim()).then(
      () => (setPath(''), props.onAdded()),
      (e: Error) => setError(e.message),
    );
  };
  return (
    <div className="pj-add">
      <InputRow
        value={path}
        onValueChange={setPath}
        onSubmit={add}
        action="Add project"
        placeholder={`/path/to/repo (a ${BRAND.dataDir} folder is created if missing)`}
        aria-label="Repo path"
        className="t-code"
      />
      {error && <span className="vf-err">{error}</span>}
    </div>
  );
}
