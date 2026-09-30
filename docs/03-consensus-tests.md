# 03 — consensus test walkthrough

File: `test/consensus.test.js`. Run with `npm test`.
It imports live code from `../server.js`; there is no copied consensus.

1. Compact round-trip: `compactFromTarget(compactTarget(bits))` preserves
   `0x207fffff` and `0x1d00ffff`.
2. Share versus block ordering: `SHARE_TARGET` is difficulty-1 divided by 32,
   `MAX_BLOCK_TARGET` stays at or below it and at or below `POW_LIMIT`, and
   `START_DIFFICULTY` is strictly above the share floor.
3. Fresh chain: two blocks carrying genesis `POW_LIMIT_BITS` cannot retarget to
   anything easier than the share target.
4. Share is not a block: on a steady chain the block target is strictly harder
   than the share target, so an accepted difficulty-32 share cannot mint a
   block on its own.
5. Difficulty one: difficulty-1 bits report difficulty `1`.
6. Steady spacing: twelve 300-second intervals keep exactly the same bits.
7. Fast blocks harden the chain: twelve one-second intervals must shrink the
   target by the full 4x step. This is the regression test for the inverted
   retarget ratio, which used to make difficulty collapse whenever blocks
   arrived quickly and left every accepted share also satisfying the block
   target.
8. Stall recovery: eleven 300-second intervals plus a one-hour final interval
   grows the target (lower difficulty) by at most 4x and never past the share
   target.
9. Convergence: a simulated solo 1.5 TH/s miner, priced block by block,
   settles at a difficulty near hashrate x 300s / 2^32 and its last interval
   lands between a third and three times the 300-second target.
10. Address check: derives an address from the secp256k1 generator point,
    decodes to 20 bytes, then mutates the last character and expects a
    checksum/length error.
11. Prevhash encoding: `notifyPrevHash()` must return a value that becomes the
    node's internal previous hash once the ASIC applies its per-word byte swap,
    and must not be the plain display hash. That display form is what made
    every Bitaxe submit measure about `1e-10` and read as “Low difficulty
    share”.
12. Hash check: empty-input `hash256` equals the known SHA-256d vector, while
    single SHA-256 equals the separate known empty digest.
13. Coinbase assembly: `createCoinbase()` must satisfy
    `raw == coinb1 + extranonce1 + extranonce2 + coinb2`, keep `extranonce1`
    out of `coinb1` so it appears exactly once, and carry an input-script
    length byte that covers the height push, both extranonces and the `DeroM`
    suffix. Embedding the pool extranonce in `coinb1` gave the ASIC a coinbase
    with that extranonce twice and a script length that no longer matched, so
    its merkle root never agreed with the node's.
14. Version rolling: `versionFor()` merges submitted bits that stay inside the
    negotiated mask into the job version, and still accepts a complete version
    field from miners that do not roll at all.
