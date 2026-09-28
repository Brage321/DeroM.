# DeroM technical review brief

**Version:** `0.1.0-dev.1`

**Review status:** experimental development prototype; not production-ready

**Purpose:** ask pool operators and mining developers for a feasibility and protocol review before any public testnet work.

## What is present

- A single-process, local development chain with SHA-256d proof-of-work and a 300-second block-spacing target.
- A Stratum V1 solo-mining listener on TCP port 3333. The default share difficulty is 1,000; valid shares are acknowledged and counted in memory, while only network-target solutions create blocks.
- A localhost-only HTTP dashboard/API on port 8080. Remote HTTP binding is rejected because RPC authentication is not implemented.
- A Windows wallet that creates encrypted secp256k1 keys and reads balances from the local node.
- A 250 DERM block subsidy, zero genesis premine, no halving, and a 100,000,000 DERM local coinbase-issuance cap. See [TOKENOMICS.md](TOKENOMICS.md).

## Review questions

1. Is the Stratum V1 job/share behavior suitable as a starting point for a pool adapter? Which miner firmware should be used for compatibility testing?
2. What node RPC/template/submission methods and share-accounting behavior would your pool require?
3. Which consensus, retarget, block validation, and coinbase rules need to change before a public testnet?
4. Which security and operational issues should block any external mining test?

## Explicitly not implemented

- No peer-to-peer protocol, chain synchronization, fork choice, public RPC, or public network.
- No PPLNS, pool accounts, durable per-worker share ledger, pool payout logic, or pool operator integration.
- No user transaction format, UTXO validation, mempool, wallet send/sign/broadcast, fees, or multiple wallet accounts.
- No production block explorer, independent security review, ASIC qualification, release signing, or verified reproducible build.

The minimum share setting is not a pool payout system. Accepted share totals are volatile and reset when the node restarts. The chain database is a local development file; the issuance cap and balances are not backed by a synchronized network.

## Local review

Requirements: Node.js 20 or newer; .NET 10 is needed only to rebuild the Windows wallet. Run `npm test` for the current unit suite, then start a fresh local node with `start.bat`. Keep the Stratum listener on a trusted private network; it is plaintext and has no TLS or pool authentication.

The tests cover a small set of crypto and target-conversion vectors. They do not establish consensus correctness, wallet security, or ASIC/pool interoperability. Please report findings with the affected file/version, impact, reproduction steps, and a suggested protocol correction where possible. Do not send real wallet secrets or valuable-fund credentials.
