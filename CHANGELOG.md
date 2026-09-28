# Changelog

The source tree follows one version number from `package.json`: `0.1.0-dev.1`.

## 0.1.0-dev.1 — development review snapshot

- Consolidated the runnable Node.js development chain, dashboard, Stratum V1 solo listener, and Windows wallet sources into a directly browsable source tree.
- Documented the proposed SHA-256 home-mining purpose and the 100,000,000 DERM issuance cap, zero premine, 250 DERM subsidy, and 300-second target.
- Added a configurable minimum Stratum share difficulty of 1,000, in-memory accepted-share counts, duplicate-share rejection, and a bounded recent-interval median retarget.
- Restricted the unauthenticated HTTP API to loopback.
- Added a small Node.js crypto/target test suite, CI workflow, security policy, tokenomics, and pool review brief.

## Version history note

Earlier repository text used `v0.0.01` and `v2.0` and described PyQt, PPLNS, peer synchronization, and multi-address wallet features. Those claims do not describe the source in this snapshot; those features are not implemented here. This development version supersedes those descriptions for review. There is no stable release or public network yet.
