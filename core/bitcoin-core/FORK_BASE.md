# DeroM Core fork record

- **Upstream:** Bitcoin Core `v31.1`
- **Upstream commit:** `9be056a8a72b624dae9623b2f7bded92c2a21c91`
- **Upstream tag object:** `bfa6a4b79cd4c1562fd32857e3147763efae37fb`
- **License:** upstream MIT license retained in [`COPYING`](COPYING), with upstream copyright notices preserved.
- **Fork scope:** chain parameters, genesis constants, DeroM subsidy/cap handling and tests, DeroM network/config isolation, and client metadata. The remaining Bitcoin Core components provide the full-validation node, P2P protocol, mempool, wallet, and Bitcoin-compatible RPC implementation.

This fork has not yet passed a local C++ build in the maintainer's Windows environment. Reviewers should treat it as an unbuilt candidate until the repository's CI build and tests pass. The release tag's upstream OpenPGP signature could not be checked in the Windows environment used to prepare this fork; verify the listed commit and source independently before relying on binaries.

Do not merge upstream changes mechanically into a launched DeroM network. Consensus and genesis changes require a separately reviewed network upgrade plan.
