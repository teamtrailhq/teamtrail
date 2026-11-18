import type { EscapeCheckRow, Scorecard, ScorecardRow } from '../model/scorecard';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const usd = (n?: number) => (n === undefined ? '–' : `$${n.toFixed(2)}`);
/** Model and agent names come from agents' own reports: kept to plain characters so they can't become markup. */
const plain = (s: string) => s.replace(/[^\w .@/·-]/g, '').slice(0, 60);

function table(rows: ScorecardRow[], first: string) {
  return [
    `| ${first} | Tickets | Verified first time | Rework | Came back | Attempts per verified | Cost per verified |`,
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((r) =>
      [
        `| ${plain(r.key)}${r.enough ? '' : ' (too few)'}`,
        r.tickets,
        pct(r.firstTimeRate),
        pct(r.reworkRate),
        r.escapeRate === undefined ? '–' : `${pct(r.escapeRate)} (${r.escaped ?? 0})`,
        r.attemptsPerVerified ?? '–',
        `${usd(r.costPerVerifiedUsd)} |`,
      ].join(' | '),
    ),
  ];
}

/** Per check that passed on verified work: how much of it came back anyway. */
function checkTable(rows: EscapeCheckRow[]) {
  return [
    '| Check | Verified tickets it passed | Came back |',
    '| --- | ---: | ---: |',
    ...rows.map(
      (r) => `| ${plain(r.key)}${r.enough ? '' : ' (too few)'} | ${r.verified} | ${pct(r.escapeRate)} (${r.escaped}) |`,
    ),
  ];
}

/**
 * The scorecard as Markdown, to share with the team: by ticket type and model, by vendor, by guide, then the checks
 * that passed on work that came back. "Came back" is verified work later reopened or reverted.
 */
export function scorecardMarkdown(s: Scorecard, title = 'Agent scorecard'): string {
  return [
    `## ${plain(title)}`,
    '',
    `${s.tickets} tickets with a completion, measured by Teamtrail on this repo. Groups under ${s.minSample} tickets are marked too few and aren't compared.`,
    '',
    ...table(s.byTypeAndModel, 'Ticket type · model'),
    '',
    ...table(s.byVendor, 'Vendor'),
    ...(s.byGuide?.length ? ['', ...table(s.byGuide, 'Guide')] : []),
    ...(s.byCheck?.some((r) => r.escaped) ? ['', ...checkTable(s.byCheck)] : []),
  ].join('\n');
}
