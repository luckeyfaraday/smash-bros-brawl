# Security policy

## Supported code

Security fixes target the latest commit on `main`. There are no maintained
release branches or supported hosted service versions.

The project includes local development servers, game-data parsers and browser
code. Development/reference servers are intended for local use. Do not expose
them to the internet as a deployment method; serve a production build instead.

## Report a vulnerability

When private vulnerability reporting is enabled, use
[Report a vulnerability](https://github.com/luckeyfaraday/smash-bros-brawl/security/advisories/new).
If the form is unavailable, open a minimal issue asking the maintainer for a
private security contact channel. Do not include exploit details in that issue.

In the private report, include:

- The affected commit, component and relevant environment.
- Reproduction steps and the impact you observed.
- A minimal synthetic example where possible, without game images, credentials
  or personal data.
- Any suggested fix or workaround.

Please allow time to investigate and coordinate disclosure. This volunteer
project does not promise a response deadline or offer a bug bounty.

## Repository checks

CI uses read-only repository permissions and does not require deployment secrets
or game assets. Dependencies are locked, and Dependabot proposes updates for npm,
Python and GitHub Actions. A source CI pass does not validate untrusted game files
or prove that every gameplay path is safe.
