/** Whether a variable's name says it holds a credential (`STRIPE_SECRET_KEY`, `GITHUB_TOKEN`, `DB_PASSWORD`). */
export function secretShaped(name: string): boolean {
  return /(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_?KEY|_KEY$|^KEY$|AUTH)/.test(name);
}
