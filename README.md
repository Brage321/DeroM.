# DeroM solo-mining development network

**Version:** `0.1.0-dev.1` · **License:** Unlicense · **Purpose:** an educational SHA-256 ASIC solo-mining experiment for home miners.

This folder now contains a local single-node development chain, an encrypted secp256k1 wallet creator, a Stratum V1 TCP gateway for SHA-256d ASICs, and the dashboard UI. It can accept mining jobs and record found blocks on the local node.

**This is an experimental development network, not a production cryptocurrency.** It has no peer-to-peer network, transaction sending, block maturity, TLS, external review, or interoperability testing across ASIC models. Difficulty adjusts toward the configured target, and the block target is always kept at least as hard as the Stratum share floor, so an accepted share can never double as a block. It has no payment use case or assigned value. Do not use it for valuable funds or advertise it as a public coin.

The source is organized as ordinary files in this repository; generated chain data, wallet files, and built executables are excluded from version control. Start with [TRANSPARENCY.md](TRANSPARENCY.md) for review order and commit-history policy, then [SOURCE_MAP.md](SOURCE_MAP.md) for every tracked file/function/endpoint, then `docs/` for the full code walkthrough. See [CHANGELOG.md](CHANGELOG.md) for the single version history, [TOKENOMICS.md](TOKENOMICS.md) for issuance, and [POOL_REVIEW.md](POOL_REVIEW.md) for a pool operator's review brief. Consensus and cryptography tests run with `npm test`.

## Start on Windows

1. Install Node.js 20 or newer.
2. Double-click `start.bat`.
3. Open [http://127.0.0.1:8080](http://127.0.0.1:8080).
4. Create a wallet. The node generates a real secp256k1 keypair, encrypts the private key with your passphrase, stores the encrypted wallet under `data/wallets`, and downloads an encrypted backup. Keep the backup and passphrase. The wallet passphrase is not saved.
5. Point a SHA-256 ASIC on the same machine to `stratum+tcp://127.0.0.1:3333`, worker `YOUR_DEROM_ADDRESS.worker1`, password `x`.

To allow an ASIC on your private LAN to connect, first stop the already-running `start.bat` node with Ctrl+C, then run `start-lan.bat` once. Both scripts use dashboard port 8080 and the same data directory, so they cannot run together. The Stratum service will bind to all network interfaces; the dashboard displays the first detected LAN IPv4 address. If the computer has multiple adapters, use the correct address shown by your operating system and set `DEROM_ADVERTISE_HOST` before launching if needed. Windows blocks inbound TCP 3333 by default, so an ASIC on another device cannot connect at all: run `allow-stratum-firewall.bat` once (it asks for administrator rights) to open port 3333 on the host firewall, and keep that rule limited to your private network. Stratum V1 here is unencrypted and has no separate pool account/password, so do not expose it to the public internet.

## Block timing and pool configuration

`derom.config.json` keeps the node's main connection settings together. The default `consensus.targetSpacingSeconds` is `300` (five minutes) and `consensus.startDifficulty` is `4096`, the block difficulty a brand-new chain begins at before the retarget calibrates to your miner. Difficulty retargeting aims for that average; proof-of-work block times are random, so it cannot guarantee a block exactly every five minutes. A changed target applies when the node starts and can alter consensus behavior, so keep it fixed for any shared network. Environment variables such as `DEROM_TARGET_SPACING_SECONDS`, `DEROM_STRATUM_HOST`, and `DEROM_STRATUM_PORT` override the file for deployment scripts.

The same `stratum` section provides a single place to configure the miner-facing listener, advertised address, and share difficulty. This makes endpoint settings easy to carry into a future pool adapter. Pool operation is not enabled today: the current service only counts valid shares in memory and finds solo blocks; it has no durable per-worker accounting or payouts, and the node has no template/submit RPC or peer network. A pool backend must be added and qualified before pool operators can point miners at DeroM. See `POOL_INTEGRATION.md` for the boundary and planned configuration seam.

The app has no npm dependencies. The `data/` directory contains the chain and encrypted wallets; back it up while the node is stopped. Deleting it resets this local development network and its wallet files.

## Mining protocol

The gateway accepts Stratum V1 JSON-line messages: `mining.subscribe`, `mining.configure` (version rolling is negotiated and the miner's rolled bits are merged into the job version), `mining.authorize`, and `mining.submit`. The miner authorization name is the DeroM address, optionally followed by `.worker`. Jobs carry the current network block target while `mining.set_difficulty` advertises the separate share-submit threshold from `derom.config.json` (default 32). A job sends `coinb1`, `coinb2` and `extranonce1` so the miner assembles the coinbase as `coinb1 + extranonce1 + extranonce2 + coinb2` — byte for byte the transaction this node rebuilds when a share arrives — and the notified `prevhash` uses the per-word byte order that Bitaxe firmware expects. Valid shares meeting the share threshold are acknowledged and counted in memory; only candidates meeting the current network target are recorded as blocks and notify miners of new work. There is no durable per-worker share ledger or pool payout system.

Stratum V1 byte-order handling varies by vendor, so this gateway was debugged against a real Bitaxe on a LAN rather than only in simulation, and that single firmware is what it is validated against today. `GET /api/shares` (loopback only) returns the last share attempts with the difficulty the node measured beside the difficulty the miner had to clear: a measured value around `1e-10` from hardware that claims difficulty 1000 means the node and the ASIC hashed different headers, while a genuinely weak share measures just under the threshold. Windows blocks inbound TCP 3333 by default; run `allow-stratum-firewall.bat` once before expecting a LAN miner to connect.

## Wallet behavior

The Windows wallet is built from source in `wallet-app/`; its usage notes are in `wallet-app/README.md`. It creates secp256k1 keys locally, encrypts the private key with PBKDF2-SHA256 and AES-256-GCM, and stores one active wallet under `%APPDATA%\DeroM`. It uses the same DeroM development-network Base58Check addresses as the node. Backups created by this app are restorable in this app. The app reads local node balance and height, but cannot send transactions because the chain has no transaction-signing or broadcast support. Dashboard-created scrypt backups are not compatible with this standalone wallet yet. Multiple wallet accounts, P2P synchronization, PPLNS payouts, and a full block explorer are not implemented.

## Consensus values in this prototype

| Parameter | Value | Implementation status |
|---|---:|---|
| Network | `derom-devnet` | Single local database; no peer networking |
| Name / ticker | DeroM / DERM | Proposed; resolve project name conflict before release |
| Maximum subsidy issuance | 100,000,000 DERM | Enforced by capping total recorded coinbase subsidy; final reward is reduced to remaining supply |
| Starting block subsidy | 250 DERM | Implemented as a fixed subsidy until the cap; no halving |
| Proof of work | SHA-256d | Implemented for block headers |
| Target block spacing | 300 seconds | Per-block difficulty adjustment aims for five minutes on average; not a guaranteed schedule |
| Difficulty | SHA-256d compact target | Starts at difficulty 4096, retargets each block toward 300 seconds (max 4× per block), and is never allowed below the share floor |
| Mining | Self-hosted solo work gateway | Stratum shares at minimum difficulty 32; no hosted pool, durable share ledger or payouts |
| Stratum | Bitcoin-style Stratum V1 subset | BIP 310 version rolling negotiated and merged; one Bitaxe firmware verified on the wire; no TLS |

Difficulty adjusts after each block toward a 300-second average using a recency-weighted mean of up to 12 recent intervals, limited to a 4× adjustment per block. Targets are inverted numbers, so blocks that arrive faster than the target make the next target smaller (harder) and a stall makes it larger (easier). The result is then clamped so the network target is never easier than the configured minimum share difficulty: if it were, every accepted share would automatically satisfy the block target as well and mint one block per share. Block times remain probabilistic. This single-node adjustment is provisional and is not a reviewed public-network difficulty algorithm. A public testnet/mainnet still needs a carefully chosen genesis block, reviewed retargeting, a complete canonical block/transaction format, P2P consensus and synchronization, transaction validation and mempool, wallet signing and recovery, block maturity, protocol audits, deterministic releases, and a tested difficulty/emission schedule.

## Release blockers

1. Replace the prototype per-block retarget with reviewed difficulty adjustment, timestamps, fork choice, genesis parameters and independent consensus test vectors.
2. Implement and validate full transactions, UTXO accounting, signature verification, fees, mempool policy, reorgs, block maturity, wallet send/restore and multiple accounts.
3. Add peer discovery and chain synchronization, then implement authenticated remote RPC, TLS or a secure network boundary, rate limiting and durable database migration. The HTTP API is currently restricted to loopback.
4. Confirm ASIC interoperability across more named devices and firmware; support relevant Stratum extensions and byte-order conventions. One Bitaxe firmware is verified end to end on the wire, other vendors and firmware versions are not.
5. Commission independent cryptography and consensus review, verify reproducibility and sign release builds, and operate a public testnet before mainnet. The CI workflow currently pins the SDK and emits a checksum; this is not an independent reproducibility or security audit.
6. Resolve the project name. DERO is already an established blockchain with its own coin and mining algorithm; “DeroM” could confuse users. Review the [official DERO project](https://docs.dero.io/) and choose a distinct name before public release.
7. Ask NitroPool directly for its current listing requirements. This project has not been listed or reviewed by NitroPool.

Protocol references: [Bitcoin Stratum V1 overview](https://en.bitcoin.it/wiki/Stratum_mining_protocol), [BIP 310 version-rolling extension](https://bitcoin.org/bip/310/), and [RandomX official description](https://github.com/tevador/RandomX). RandomX targets general-purpose CPUs and is not a fit for this ASIC-oriented SHA-256d proposal.
