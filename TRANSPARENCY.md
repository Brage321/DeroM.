# Source transparency and commit history

**Canonical source:** this folder (`https://github.com/Brage321/DeroM.`).
Pool reviewers should use only this repository and this document.

## How to read this repository

- `SOURCE_MAP.md`
  Lists every tracked source file and what it does, plus the functions,
  classes, endpoints, and protocol messages in each file.
- `docs/code-walkthrough.md`
  Explains every function/method, HTTP endpoint, Stratum message, config
  key, test case, workflow job, and script in review order.
- `CHANGELOG.md`
  Human-readable change per tracked release/snapshot.
- Git history (`git log --stat`, `git show <commit>`)
  One commit per logical source change. Review each commit alone; each
  message says which files changed and why.

Verify the tree before review:

```bash
git status --short
git log --oneline --stat
npm test
```

## Commit-history policy

Use small, reviewable commits. Do not squash unrelated changes:

- One logical change per commit.
- Commit message format: short imperative summary, blank line, then
  “what changed / why / how verified”.
- Never commit generated artifacts (`data/`, `work/`, `node_modules/`,
  wallet `bin/`/`obj/`, built wallet executables, logs, chain/wallet JSON).
- Never commit secrets, passphrases, private keys, or wallet backups.
- Keep `main` green: `npm test` must pass before pushing.

Example:

```text
Add share-floor clamp to difficulty retarget

- server.js: clamp nextBits() to MIN_BLOCK_TARGET.
- test/consensus.test.js: assert share floor holds at 1,000.

Verified: npm test (7/7 passing).
```

## What is intentionally untracked

- `data/`
  Local chain database and encrypted wallets created at runtime.
- `work/`
  Local tooling notes/scratch files; not part of the node.
- `core/`
  Local-only upstream/tooling checkout. Not DeroM source, not published,
  not part of pool review.
- `node_modules/`, wallet `bin/`/`obj/`, `wallet-exe/`,
  `wallet-exe-standalone/`, `*.log`
  Build outputs and dependencies regenerated locally.

If a pool reviewer needs provenance for one of those paths, ask for a
separate source commit; do not accept it as implicit chain history.

## Provenance correction

An earlier upload-only state plus a later squashed import left the public
history without useful per-change commits. From this document forward,
every source change gets its own commit and a changelog entry. Old binary
or upstream/tooling history is not rewritten as fake source history.
