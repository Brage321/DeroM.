# Changelog

The source tree follows one version number from `package.json`: `0.1.0-dev.1`.

## Unreleased — Bitaxe share compatibility (verified on hardware)

A Bitaxe connected over the LAN had every share rejected as "Low difficulty
share" while the node measured about `1e-10`, and shares that were finally
accepted each minted a block. Two byte-layout bugs in the job caused the first
half, and both are now fixed:

- server.js: `notifyPrevHash()` sends the prevhash in the per-word byte order
  the firmware expects. Bitaxe reverses the bytes inside every 32-bit word of
  the notified prevhash before hashing, so the job must carry the form that
  becomes this node's internal previous hash under that swap. Rebuilding the
  captured submits under the corrected order measured genuine difficulties of
  290 to 15,700 where the node had scored `1e-10`.
- server.js: `createCoinbase()` no longer embeds the pool extranonce in
  `coinb1`. Miners assemble `coinb1 + extranonce1 + extranonce2 + coinb2`
  themselves, so embedding it gave the ASIC a coinbase holding that extranonce
  twice with an input-script length that no longer matched, and its merkle root
  could never agree with the node's. This is why submits were still rejected
  after the prevhash and version-rolling fixes landed.
- server.js: the recent-share ring behind `GET /api/shares` now also carries the
  job fields (`coinb1`/`coinb2`/prevhash/bits/extranonce1), so a header
  mismatch can be reproduced offline instead of guessed at.
- Verified end to end on the wire: 948 accepted shares with zero rejects, and
  blocks at the network target as difficulty retargeted upward (4096 to
  131072) rather than one block per share.
- test/consensus.test.js: 15 passing tests, now covering the ASIC prevhash byte
  order, the coinbase concatenation invariant, and version-rolling merge.


## Unreleased — solo mining difficulty corrections

- server.js: fixed the inverted retarget ratio. Blocks arriving faster than the
  target now make the next target harder instead of easier, so difficulty can
  actually rise on a fresh solo chain.
- server.js: the network target is capped at `MAX_BLOCK_TARGET`, so a block is
  always harder than a share. Previously the chain sat at `POW_LIMIT`, about
  6.9e10 times easier than a difficulty-32 share, which made every accepted
  share mint a block.
- server.js: a new chain starts at `consensus.startDifficulty` (default 4096),
  validated to stay strictly above the share floor, and `/api/state` reports
  the current network difficulty.
- allow-stratum-firewall.bat: opens inbound TCP 3333, which Windows blocks by
  default; without it a Bitaxe cannot reach the node even when it binds to
  0.0.0.0.
- app.js: the dashboard shows the block difficulty next to the share floor and
  explains that most shares are credit only.
- test/consensus.test.js: 12 passing tests covering share-versus-block target
  ordering, retarget direction, stall recovery, and convergence of a simulated
  solo 1.5 TH/s miner to roughly 300-second blocks.

## Unreleased — transparency docs

- Added `TRANSPARENCY.md` with the canonical repository, review order,
  per-change commit policy, untracked paths, and provenance note.
- Added `SOURCE_MAP.md` listing every tracked file/function/endpoint.
- Added `docs/` function-by-function walkthrough for node, dashboard,
  tests, wallet, config, scripts, and CI.
- Linked the new review docs from `README.md` and corrected the wallet
  build description to source in `wallet-app/`.

## 0.1.0-dev.1 — development review snapshot

- Consolidated the runnable Node.js development chain, dashboard, Stratum V1 solo listener, and Windows wallet sources into a directly browsable source tree.
- Documented the proposed SHA-256 home-mining purpose and the 100,000,000 DERM issuance cap, zero premine, 250 DERM subsidy, and 300-second target.
- Added a configurable minimum Stratum share difficulty of 1,000, in-memory accepted-share counts, duplicate-share rejection, and a bounded recent-interval median retarget.
- Restricted the unauthenticated HTTP API to loopback.
- Added a small Node.js crypto/target test suite, CI workflow, security policy, tokenomics, and pool review brief.

## Version history note

Earlier repository text used `v0.0.01` and `v2.0` and described PyQt, PPLNS, peer synchronization, and multi-address wallet features. Those claims do not describe the source in this snapshot; those features are not implemented here. This development version supersedes those descriptions for review. There is no stable release or public network yet.
