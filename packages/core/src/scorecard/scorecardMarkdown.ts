import type { Scorecard, ScorecardRow } from '../model/scorecard';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const usd = (n?: number) => (n === undefined ? '–' : `$${n.toFixed(2)}`);
/** Model and agent names come from agents' own reports: kept to plain characters so they can't become markup. */
const plain = (s: string) => s.replace(/[^\w .@/·-]/g, '').slice(0, 60);

function table(rows: ScorecardRow[], first: string) {
  return [
    `| ${first} | Tickets | Verified first time | Rework | Attempts per verified | Cost per verified |`,
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((r) =>
      [
        `| ${plain(r.key)}${r.enough ? '' : ' (too few)'}`,
        r.tickets,
        pct(r.firstTimeRate),
        pct(r.reworkRate),
        r.attemptsPerVerified ?? '–',
        `${usd(r.costPerVerifiedUsd)} |`,
      ].join(' | '),
    ),
  ];
}

/** The scorecard as Markdown, to share with the team: by ticket type and model, then by vendor. */
export function scorecardMarkdown(s: Scorecard, title = 'Agent scorecard'): string {
  return [
    `## ${plain(title)}`,
    '',
    `${s.tickets} tickets with a completion, measured by Teamtrail on this repo. Groups under ${s.minSample} tickets are marked too few and aren't compared.`,
    '',
    ...table(s.byTypeAndModel, 'Ticket type · model'),
    '',
    ...table(s.byVendor, 'Vendor'),
  ].join('\n');
}
