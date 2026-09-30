'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  compactTarget,
  compactFromTarget,
  targetDifficulty,
  nextBits,
  hash256,
  addressFromPubkey,
  b58decode,
  notifyPrevHash,
  createCoinbase,
  DIFF1_TARGET,
  POW_LIMIT,
  POW_LIMIT_BITS,
  SHARE_TARGET,
  MAX_BLOCK_TARGET,
  versionFor,
  VERSION_ROLLING_MASK,
  MIN_SHARE_DIFFICULTY,
  START_DIFFICULTY,
  START_BLOCK_TARGET,
  TARGET_SPACING_SECONDS
} = require('../server.js');

const hexBits = bits => bits.toString(16).padStart(8, '0');
const startBits = compactFromTarget(START_BLOCK_TARGET);

// Build a chain of the given block intervals at a fixed compact target.
function chainWith(intervals, bits) {
  const blocks = [{ height: 0, time: 0, bits }];
  intervals.forEach((interval, index) => {
    blocks.push({ height: index + 1, time: blocks[index].time + interval, bits });
  });
  return blocks;
}

const steady = () => Array.from({ length: 12 }, () => TARGET_SPACING_SECONDS);

test('compact target encodings round-trip for configured proof-of-work bounds', () => {
  for (const bits of [0x207fffff, 0x1d00ffff]) {
    assert.equal(compactFromTarget(compactTarget(bits)), bits);
  }
});

test('the share target is difficulty 32 and stays easier than any block target', () => {
  assert.equal(MIN_SHARE_DIFFICULTY, 32);
  assert.equal(SHARE_TARGET, DIFF1_TARGET / 32n);
  assert.ok(MAX_BLOCK_TARGET <= SHARE_TARGET, 'a block must never be easier than a share');
  assert.ok(MAX_BLOCK_TARGET <= POW_LIMIT, 'the block target must stay inside the proof-of-work limit');
  assert.ok(START_DIFFICULTY > MIN_SHARE_DIFFICULTY, 'the chain must not start where every share is a block');
});

test('a fresh chain cannot start easier than the share target', () => {
  const fresh = [
    { height: 0, time: 1780000000, bits: hexBits(POW_LIMIT_BITS) },
    { height: 1, time: 1780000001, bits: hexBits(POW_LIMIT_BITS) }
  ];
  const bits = nextBits(fresh);
  assert.ok(compactTarget(bits) <= SHARE_TARGET, 'genesis work must not leave blocks easier than shares');
  assert.ok(targetDifficulty(bits) >= MIN_SHARE_DIFFICULTY);
});

test('a difficulty-32 share does not automatically satisfy the block target', () => {
  const bits = nextBits(chainWith(steady(), hexBits(startBits)));
  assert.ok(compactTarget(bits) < SHARE_TARGET, 'an accepted share must be easier than a valid block');
  assert.ok(targetDifficulty(bits) > MIN_SHARE_DIFFICULTY, 'block difficulty must sit above the share floor');
});

test('difficulty-one compact target has difficulty one', () => {
  assert.equal(targetDifficulty(0x1d00ffff), 1);
});

test('steady five-minute spacing leaves the compact target unchanged', () => {
  const bits = nextBits(chainWith(steady(), hexBits(startBits)));
  assert.equal(bits, startBits);
});

test('blocks that arrive too fast make the next target harder, not easier', () => {
  const bits = nextBits(chainWith(Array.from({ length: 12 }, () => 1), hexBits(startBits)));
  const previous = compactTarget(startBits);
  assert.ok(compactTarget(bits) < previous, 'a flood of blocks must raise difficulty, not lower it');
  assert.ok(compactTarget(bits) <= previous / 4n, 'a 300x flood should move the full fourfold step');
});

test('a long stall eases the target without ever passing the share floor', () => {
  const intervals = [...Array.from({ length: 11 }, () => TARGET_SPACING_SECONDS), 3600];
  const bits = nextBits(chainWith(intervals, hexBits(startBits)));
  const previous = compactTarget(startBits);
  assert.ok(compactTarget(bits) > previous, 'a stalled chain must become easier so it can recover');
  assert.ok(compactTarget(bits) <= previous * 4n, 'one hour of downtime must not cut difficulty by more than four');
  assert.ok(compactTarget(bits) <= SHARE_TARGET, 'recovery must stop at the share difficulty');
});

test('a solo 1.5 TH/s miner is retargeted to roughly five-minute blocks', () => {
  const hashesPerSecond = 1_500_000_000_000;
  const blocks = [{ height: 0, time: 1780000000, bits: hexBits(startBits) }];
  for (let height = 1; height <= 400; height++) {
    const bits = nextBits(blocks);
    const seconds = Math.max(1, Math.round(targetDifficulty(bits) * 2 ** 32 / hashesPerSecond));
    blocks.push({ height, time: blocks[height - 1].time + seconds, bits: hexBits(bits) });
  }
  const equilibrium = hashesPerSecond * TARGET_SPACING_SECONDS / 2 ** 32;
  const settled = targetDifficulty(nextBits(blocks));
  assert.ok(settled > equilibrium / 3 && settled < equilibrium * 3,
    `difficulty ${settled.toFixed(0)} should settle near ${equilibrium.toFixed(0)} for 300s spacing`);
  const lastInterval = blocks.at(-1).time - blocks.at(-2).time;
  assert.ok(lastInterval > TARGET_SPACING_SECONDS / 3 && lastInterval < TARGET_SPACING_SECONDS * 3,
    `the final block interval was ${lastInterval}s, expected near ${TARGET_SPACING_SECONDS}s`);
});

// A Bitaxe that rolls version bits submits only the bits it changed inside the
// agreed mask. Reading that value as a whole version field makes the node hash
// a different header than the ASIC, and every share then comes back as
// "Low difficulty share". These are values seen on the wire from a real Bitaxe.
test('rolled version bits merge into the job version instead of replacing it', () => {
  const job = { version: 0x20000000 };
  assert.equal(versionFor(job, '00068000'), 0x20068000);
  assert.equal(versionFor(job, '0015c000'), 0x2015c000);
  assert.equal(versionFor(job, '00000000'), 0x20000000);
});

test('a complete version field is still accepted from miners that do not roll', () => {
  const job = { version: 0x20000000 };
  assert.equal(versionFor(job, '20000000'), 0x20000000);
  assert.equal(versionFor(job, '201fe000'), 0x201fe000);
  assert.equal(versionFor(job, undefined), 0x20000000);
  assert.equal(versionFor(job, 'nonsense'), 0x20000000);
});

test('DeroM Base58Check addresses validate and reject a changed checksum', () => {
  const publicKey = Buffer.from('0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8', 'hex');
  const address = addressFromPubkey(publicKey);
  assert.equal(b58decode(address).length, 20);
  const corrupt = address.slice(0, -1) + (address.at(-1) === '1' ? '2' : '1');
  assert.throws(() => b58decode(corrupt), /checksum|length/i);
});

// Verified against a real Bitaxe on the wire: the firmware byte-reverses every
// 32-bit word of the notified prevhash before hashing the header.
function asicWordSwap(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i + 3 < buf.length; i += 4) {
    out[i] = buf[i + 3];
    out[i + 1] = buf[i + 2];
    out[i + 2] = buf[i + 1];
    out[i + 3] = buf[i];
  }
  return out;
}

test('mining.notify prevhash becomes the header prevhash after the ASIC word swap', () => {
  const prevInternal = Buffer.from('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20', 'hex');
  const notified = notifyPrevHash({ prevInternal });
  assert.equal(notified.length, 64);
  assert.equal(asicWordSwap(Buffer.from(notified, 'hex')).toString('hex'), prevInternal.toString('hex'));
  assert.notEqual(notified, Buffer.from(prevInternal).reverse().toString('hex'), 'the plain display hash is what made every Bitaxe share measure 1e-10');
});

// The ASIC assembles coinb1 + extranonce1 + extranonce2 + coinb2 itself. If the
// node already baked extranonce1 into coinb1, the ASIC's transaction held the
// pool extranonce twice, the input script length byte no longer matched, and the
// merkle roots differed — every share then measured ~1e-10 no matter how hard
// the ASIC actually worked.
test('coinb1 stops before the pool extranonce so the ASIC rebuilds the same coinbase', () => {
  const ex1 = Buffer.from('196a9772', 'hex');
  const ex2 = Buffer.from('00000001', 'hex');
  const { coinb1, coinb2, raw } = createCoinbase(1, 'NSuf8nZ1TQRszCq48ZmimY2kgE3pvkfRvd', ex1, ex2, 25_000_000_000n);
  assert.equal(Buffer.concat([coinb1, ex1, ex2, coinb2]).toString('hex'), raw.toString('hex'), 'miner concatenation must equal the node coinbase');
  assert.equal(raw.toString('hex').split('196a9772').length - 1, 1, 'the pool extranonce must appear exactly once');
  assert.ok(!coinb1.toString('hex').includes('196a9772'), 'coinb1 must end before the pool extranonce');
  // 4 version + 1 input count + 32 prevout hash + 4 prevout index, then the
  // script length byte: height push (2) + ex1 (4) + ex2 (4) + "DeroM" (5).
  assert.equal(coinb1[41], 2 + ex1.length + ex2.length + 5, 'input script length must cover height, both extranonces and the suffix');
});

test('SHA-256d helper matches the empty-input reference vector', () => {
  assert.equal(hash256(Buffer.alloc(0)).toString('hex'), '5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456');
  assert.equal(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
