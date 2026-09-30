# 01 — server.js walkthrough

`server.js` is the whole backend: config loading, chain storage,
wallet creation, Stratum mining gateway, and dashboard HTTP API.

## Config loading
At startup it reads `derom.config.json` when present, then resolves each
setting with `configured(env, fileValue, fallback)`. Environment variables
override the file. Invalid spacing, share difficulty, ports, or a
non-loopback HTTP host throw before the node starts.

Important constants:

- `REWARD = 250 DERM` in atomic units.
- `MAX_SUPPLY = 100,000,000 DERM` in atomic units.
- `POW_LIMIT_BITS = 0x207fffff`.
- `VERSION = 0x20000000`.
- `ADDRESS_VERSION = 0x35`.
- `MAX_BODY = 16 KiB` for wallet-create request bodies.

## Hash/encoding helpers

- `sha256(b)` hashes once.
- `hash256(b)` hashes twice; block headers and txids use this.
- `hash160(b)` is `RIPEMD160(SHA256(b))`; address key-hash uses this.
- `u32(n)` and `u64(n)` encode header fields and reward amounts.
- `varInt(n)` encodes transaction length prefixes.
- `reverse(b)` converts between internal byte order and display order.
- `hex(b)` formats buffers for JSON/logs.
- `displayHash(raw)` reverses then hex-encodes a hash.

## Difficulty helpers

- `compactTarget(bits)` expands compact difficulty to a target integer.
- `compactFromTarget(target)` compresses a target back to `bits`.
- `targetDifficulty(bits)` divides the difficulty-1 target by this target.
- `nextBits(chain)` weights recent block intervals and scales the target by
  the actual-over-expected ratio (fast blocks shrink the target = harder,
  a stalled chain grows it = easier), limited to a 4x move per block. The
  easier than `SHARE_TARGET`. A brand-new chain starts at the stricter of

## Address helpers

- `b58encode` converts 25 payload-plus-checksum bytes to Base58.
- `b58decode` reverses it and rejects bad characters, wrong length, bad
  checksum, or wrong network version.
- `addressFromPubkey` hashes an uncompressed secp256k1 key and adds checksum.
- `scriptForAddress` builds P2PKH `76a914...88ac` after validating address.

## Chain helpers

- `scriptNum(n)` encodes block height for the coinbase script.
- `merkleRoot(coinbase)` returns the sole transaction hash.
- `headerFor(...)` concatenates version, prev hash, merkle, time, bits, nonce.
- `genesis()` builds height 0 with no spendable reward.
- `loadChain()` creates or validates `data/blocks.json`.
- `saveChain()` writes through `blocks.json.tmp` then renames.
- `issuedSupply()` sums recorded coinbase rewards.
- `blockSubsidy()` returns 250 DERM, trims the final reward, then zero.
- `createCoinbase(...)` splits the transaction into `coinb1`/`coinb2`, stopping
  `coinb1` before the pool extranonce so the miner can insert both extranonces.
- `balance(address)` sums local rewards paid to one address.

## Wallet helper

`createWallet(passphrase)` requires 12-1024 characters, generates secp256k1,
extracts the uncompressed public key, derives the address, encrypts the
private PEM with scrypt plus AES-256-GCM, and writes mode-`0600` JSON.

## Stratum flow

1. `stratumServer()` accepts TCP JSON-line messages.
2. `mining.subscribe` returns session IDs and extranonce size 4.
3. `mining.authorize` takes `ADDRESS[.worker]`, validates the address, then
   `notifyJob()` sends difficulty and work.
4. `nextJob()` snapshots tip, bits, reward, time, and random job ID. `coinb1`
   ends before the pool extranonce, because the miner assembles
   `coinb1 + extranonce1 + extranonce2 + coinb2` and `buildCandidate()` must
   rebuild those exact bytes.
5. `notifyPrevHash()` sends `wordBytes(prevInternal)`. ASIC firmware reverses
   the bytes inside every 32-bit word of the notified prevhash, and the result
   must be the node's internal previous hash. The plain display hash makes the
   ASIC mine a different header, so every submit returns “Low difficulty
   share” while the node measures about `1e-10`.
6. `mining.submit` calls `onSubmit()`, which checks worker/job freshness,
   chain tip, timestamp window, duplicates, and share difficulty.
7. Valid shares increment counters; network-valid solutions append a block,
   persist the chain, acknowledge the miner, and notify all miners.
