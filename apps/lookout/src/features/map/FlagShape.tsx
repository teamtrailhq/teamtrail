/** A planted flag, drawn by hand like the X it replaces, centred on 0,0: the pole, its pennant and the ground. */
export function FlagShape() {
  return (
    <>
      <path className="flag-ground" d="M-17 18 C-12 17 -5 17 1 18" />
      <path className="flag-pole" d="M-8 18 C-8.6 6 -7.6 -6 -8 -18" />
      <path className="flag-cloth" d="M-8 -18 C-1 -16 6 -13 15 -10 C6 -7.5 -1 -5.5 -8 -3 Z" />
    </>
  );
}
