const ACCENT = 'var(--accent)';

const ICONS = {
  map: (
    <>
      <path d="M3 6l6-2.5 6 2.5 6-2.5v14.5L15 20.5 9 18l-6 2.5z" />
      <path d="M9 3.5V18M15 6v14.5" />
      <path d="M5.5 15c2-1 3-3 5-3.5s3-3 5-4" stroke={ACCENT} strokeDasharray="2 2.2" />
    </>
  ),
  note: (
    <>
      <path d="M5 3.5h14v13.5l-4 3.5H5z" />
      <path d="M15 21v-4h4" />
      <path d="M8.5 8h7M8.5 12h7" stroke={ACCENT} />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5C10 4.5 7 4 3.5 4.5v14c3.5-.5 6.5 0 8.5 2 2-2 5-2.5 8.5-2v-14C17 4 14 4.5 12 6.5z" />
      <path d="M12 6.5v14" />
      <path d="M15 9.5l3-.5M15 13l3-.5" stroke={ACCENT} />
    </>
  ),
  flag: (
    <>
      <path d="M6 21.5V3" />
      <path d="M6 4c4-1.5 7 1.5 12 0v9c-5 1.5-8-1.5-12 0z" fill={ACCENT} stroke={ACCENT} />
    </>
  ),
  tent: (
    <>
      <path d="M12 4L2.5 20h19z" />
      <path d="M12 11l-4 9h8z" fill={ACCENT} stroke={ACCENT} />
      <path d="M12 4l-1.5-2M12 4l1.5-2" />
    </>
  ),
  mailbox: (
    <>
      <path d="M12 21.500V14" />
      <path d="M4 14V9.500A4.5 4.5 0 0 1 8.5 5h7A4.5 4.5 0 0 1 20 9.500V14z" />
      <path d="M8.5 5A4.5 4.5 0 0 1 13 9.500V14" />
      <path d="M16 10V6.500M16 6.500h3v2.500h-3" stroke={ACCENT} />
    </>
  ),
};

export type ZoneIconName = keyof typeof ICONS;

/** The small icon next to a zone's title. Decoration only, so screen readers skip it. */
export function ZoneIcon({ name }: { name: ZoneIconName }) {
  return (
    <svg
      className="zone-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}
