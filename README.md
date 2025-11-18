# Auto data-cy suggestions (static-only)

This variant performs **static analysis** of files changed in a PR and posts **suggested `data-cy` attributes** as a comment on the PR. It does not run the application or a browser preview; it only reads files in the PR branch using the GitHub Actions runner and the Octokit API to list changed files.

## How it works (summary)
- Action triggers on pull_request events.
- It checks out the PR branch and runs `node src/static/scanner.js`.
- The scanner lists files changed in the PR, parses JSX/TSX/JS files, finds interactive elements missing `data-cy`, generates deterministic names, and posts a markdown table comment on the PR with suggestions.


## Setup(scopes: contents read/write, pull-requests write, issues write).
2. Ensure the workflow uses the checkout action with github token
3. Push this code to your repo and open a PR to test — the Action will post suggestions if relevant elements are found.
