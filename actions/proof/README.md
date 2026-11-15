# Verified by Teamtrail (GitHub Action)

Checks that a pull request carries a [Teamtrail proof](https://www.teamtrail.app/docs/verification/#verified-by-teamtrail) that verifies at its head commit, and records the result as the `Teamtrail proof verified` commit status, which branch protection can require.

```yaml
# .github/workflows/teamtrail-proof.yml
name: Teamtrail proof
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]
  issue_comment:
    types: [created, edited]
permissions:
  contents: read
  pull-requests: read
  statuses: write
jobs:
  proof:
    if: github.event_name == 'pull_request' || github.event.issue.pull_request
    runs-on: ubuntu-latest
    steps:
      - uses: teamtrailhq/teamtrail/actions/proof@main
```

It passes when every Teamtrail proof on the pull request (its description and its comments) is signed by one of the keys committed in `.teamtrail/proof-keys/` on the default branch, unchanged since Teamtrail wrote it, verified, and made at the pull request's latest commit. A pull request with no proof fails.

To make it required, add `Teamtrail proof verified` to the branch's required status checks and choose GitHub Actions as its expected source, so only this workflow can set it.

What it proves: the report came from a Teamtrail on a machine whose key your repo lists, and nothing in it changed since. It doesn't judge the code, and anyone holding that machine's key could sign a report.
