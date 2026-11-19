/** What the trail lead typed to name a pull request: its number, or why it doesn't name one in this repo. */
export type PrInput = { kind: 'number'; pr: number } | { kind: 'invalid'; why: string };

const PR_URL = /^https?:\/\/[^/]+\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i;

const asNumber = (digits: string): PrInput => {
  const n = Number(digits);
  if (Number.isSafeInteger(n) && n > 0 && n < 2 ** 31) return { kind: 'number', pr: n };
  return { kind: 'invalid', why: 'That is not a pull request number.' };
};

/**
 * A pull request number from `12`, `#12` or the PR's web address in `repo` (`owner/name`, any case). An address in
 * another repository is refused, since PR sync reads this one only. Pure; the server checks the PR exists.
 */
export function prNumberOf(input: string, repo: string): PrInput {
  const text = input.trim();
  const plain = /^#?(\d{1,10})$/.exec(text);
  if (plain) return asNumber(plain[1]);
  const url = PR_URL.exec(text);
  if (!url) return { kind: 'invalid', why: 'Type a pull request number, like 12, or paste its link.' };
  if (`${url[1]}/${url[2]}`.toLowerCase() !== repo.toLowerCase())
    return { kind: 'invalid', why: `That pull request is in ${url[1]}/${url[2]}; PR sync reads ${repo}.` };
  return asNumber(url[3]);
}
