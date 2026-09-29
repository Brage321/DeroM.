# 03 — consensus test walkthrough

File: `test/consensus.test.js`. Run with `npm test`.
It imports live code from `../server.js`; there is no copied consensus.

1. Compact round-trip: `compactFromTarget(compactTarget(bits))` preserves
   `0x207fffff` and `0x1d00ffff`.
2. Difficulty one: difficulty-1 bits report difficulty `1`.
3. Share floor: `MIN_SHARE_DIFFICULTY` is `1000`, `MIN_BLOCK_TARGET` is at or
   below `POW_LIMIT`, and difficulty-1 divided by the floor stays at/above
   `1000`.
4. Spike resistance: twelve 300-second intervals plus one 1-second interval
   keep the same bits.
5. Stall recovery: same chain plus a one-hour final interval lowers the target
   by at least 4x.
6. Address check: derives an address from the secp256k1 generator point,
   decodes to 20 bytes, then mutates the last character and expects a
   checksum/length error.
7. Hash check: empty-input `hash256` equals the known SHA-256d vector, while
   single SHA-256 equals the separate known empty digest.
