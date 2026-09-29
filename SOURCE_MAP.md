# DeroM source map — every tracked file

Canonical repo: `https://github.com/Brage321/DeroM.`
Scope: only files tracked by git on `main`. Generated data, local `core/`
and `work/` scratch material, dependencies, and built executables are out
of scope.

## Node runtime

### `server.js` — single-process dev chain, Stratum gateway, dashboard API

Startup/config:

- `configured(env, value, fallback)`
  Precedence: environment variable, then `derom.config.json`, then default.
- `start()`
  Loads chain, starts dashboard then Stratum, handles `EADDRINUSE`.
- `listen(server, host, port, label)`
  Promise wrapper tagging startup errors as `dashboard` or `Stratum`.

Hashing/encoding:

- `sha256(bytes)` — single SHA-256 digest.
- `hash256(bytes)` — double SHA-256 for headers/transaction IDs.
- `hash160(bytes)` — `RIPEMD160(SHA256(bytes))` for address key-hash.
- `u32(n)` / `u64(n)` — little-endian encoders for headers/amounts.
- `varInt(n)` — Bitcoin-style variable-length integer.
- `reverse(bytes)` — byte reversal for internal/display hash order.
- `hex(bytes)` — buffer-to-hex helper.
- `displayHash(rawHash)` — reversed-hex display form for logs/API.

Proof-of-work:

- `compactTarget(bits)` — compact `bits` to BigInt target.
- `compactFromTarget(target)` — BigInt target back to compact `bits`.
- `targetDifficulty(bits)` — difficulty relative to difficulty-1.
- `nextBits(activeChain = chain)` — per-block weighted retarget toward
  `TARGET_SPACING_SECONDS`, clamped to 4x, bounded by `POW_LIMIT`, floored
  at `MIN_BLOCK_TARGET`, with fast recovery after a long stall.

Addresses/scripts:

- `b58encode(input)` / `b58decode(string)` — Base58Check with length,
  checksum, and version `0x35` checks.
- `addressFromPubkey(pub)` — `0x35 || hash160(pubkey)` plus checksum.
- `scriptForAddress(address)` — P2PKH `76a914<20 bytes>88ac`.
- `scriptNum(n)` — minimal push encoding for height in coinbase.
- `merkleRoot(coinbase)` — single-transaction root equals its txid.
- `headerFor(prevRaw, merkle, time, nonce, bits, version)` — 80-byte header.
Chain/wallet/supply:

- genesis() — height-0 record, zero spendable reward, local genesis text.
- loadChain() / saveChain() — creates/loads data/blocks.json atomically.
- pubkeyBytes(publicKey) — 65-byte uncompressed key from SPKI DER.
- createWallet(passphrase) — secp256k1 keypair, scrypt plus AES-GCM, one file mode 0600.
- issuedSupply() / blockSubsidy() — fixed 250 DERM until 100,000,000 cap.
- createCoinbase(height, address, ex1, ex2, reward) — coinb1/coinb2/raw split.
- balance(address) — sums local coinbase rewards for one address.

Mining/stratum:

- nextJob(address, ex1) — next Stratum job from tip and fresh bits/reward.
- notifyJob(client, clean) — set_difficulty then notify.
- send(client, id, methodOrResult, paramsOrError) — JSON-line writer.
- buildCandidate(job, ex2, time, nonce, version) — validates and rebuilds header/hash.
- onSubmit(client, id, params) — rejects stale/duplicate/low-difficulty shares.
- stratumServer() — subscribe, authorize with address, submit, ping.

HTTP/dashboard:

- json(res, status, body) — JSON response with no-store and nosniff.
- readBody(req) — 16 KiB JSON body reader.
- api(req, res, url) — state, blocks, balance, wallet create/backup routes.
- webServer() — serves API plus index.html, styles.css, forms.css, app.js.
- module.exports — exports pure consensus/address helpers for tests.

### derom.config.json — node settings

- consensus.targetSpacingSeconds — retarget goal; default 300.
- http.host / http.port — dashboard listener; host stays loopback.
- stratum.listenHost / stratum.port — miner-facing TCP listener.
- stratum.advertiseHost — displayed address; LAN IP when 0.0.0.0.
- stratum.minimumShareDifficulty — share floor; default 1000.

### package.json — runtime/test metadata

- start: node server.js.
- test: node test/consensus.test.js.
- Engines: Node.js >=20; no runtime npm dependencies.

## Dashboard UI

### app.js — browser dashboard logic

- showToast(message) — transient status toast.
- targetLabel(seconds) — human-readable block-target label.
- updateWallet(address) — persists address, updates wallet panel.
- copyText(value, success) — clipboard helper.
- api(path, options) — JSON fetch wrapper throwing node errors.
- refreshBalance() — converts atomicUnits to DERM.
- refreshState() — polls /api/state; renders online/offline UI.
- Wallet submit handler — matching passphrases, create/download backup.
- downloadBackup(data, address) — downloads wallet JSON.
- Event wiring — backup/copy/refresh/dialogs/persisted address/polling.

### index.html — dashboard structure

Sidebar/workspace, status/balance/height/miner cards, wallet/mining panels,
activity panel, wallet/setup dialogs, app.js script, 12-char passphrase form.

### styles.css / forms.css — styling

styles.css: layout/cards/panels. forms.css: dialogs/inputs/buttons.

## Tests

### test/consensus.test.js — consensus/crypto suite

Live imports from ../server.js: compact round-trip, difficulty one,
share floor 1000, spike resistance, stall recovery, address checksum,
empty-input SHA-256d vector.

## Windows wallet

### wallet-app/Program.cs — desktop wallet

Program.Main, MainForm UI/polling, CreateWallet/Restore/Export/Copy/Save/
Apply/RefreshNode, PasswordDialog 10-char minimum, WalletFile schema,
WalletCrypto Encrypt/Decrypt PBKDF2 plus AES-GCM, AddressCodec 0x35 format,
Ripemd160.Hash, Card/LabelText/Button helpers.

### wallet-app/DeroMWallet.csproj — WinExe net10.0-windows Forms build.
### wallet-app/README.md — create/restore/export and no-send limits.

## Launch scripts

- start.bat — runs node server.js locally.
- start-lan.bat — adds DEROM_STRATUM_HOST=0.0.0.0 for LAN ASICs.

## Docs/policy

README, CHANGELOG, TRANSPARENCY, POOL_REVIEW, POOL_INTEGRATION,
TOKENOMICS, SECURITY, LICENSE, ci.yml, .gitattributes/.gitignore/global.json.

## Out of scope

DeroM.zip, data/, work/, core/, node_modules/, wallet build outputs,
built executables, logs: runtime outputs/scratch/dependencies only.
