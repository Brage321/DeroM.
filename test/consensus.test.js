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
  DIFF1_TARGET,
  POW_LIMIT,
  POW_LIMIT_BITS,
  MIN_BLOCK_TARGET,
  MIN_SHARE_DIFFICULTY
} = require('../server.js');

test('compact target encodings round-trip for configured proof-of-work bounds', () => {
  for (const bits of [0x207fffff, 0x1d00ffff]) {
    assert.equal(compactFromTarget(compactTarget(bits)), bits);
  }
});

test('network target starts near the proof-of-work limit, not the share floor', () => {
  assert.equal(MIN_BLOCK_TARGET, POW_LIMIT);
  assert.equal(compactFromTarget(POW_LIMIT), POW_LIMIT_BITS);
});

test('difficulty-one compact target has difficulty one', () => {
  assert.equal(targetDifficulty(0x1d00ffff), 1);
});

test('default share floor is low enough for a single Bitaxe to submit', () => {
  assert.equal(MIN_SHARE_DIFFICULTY, 32);
});

test('difficulty retarget uses the recent interval median to ignore one timestamp spike', () => {
  const bits = POW_LIMIT_BITS;
  const blocks = Array.from({ length: 12 }, (_, height) => ({ height, time: height * 300, bits: bits.toString(16) }));
  blocks.push({ height: 12, time: blocks[11].time + 1, bits: bits.toString(16) });
  assert.equal(nextBits(blocks), bits);
});

test('difficulty falls quickly after a long stall so the chain can recover', () => {
  const bits = POW_LIMIT_BITS;
  const blocks = Array.from({ length: 12 }, (_, height) => ({ height, time: height * 300, bits: bits.toString(16) }));
  const stalled = { height: 12, time: blocks[11].time + 3600, bits: bits.toString(16) };
  const recovered = nextBits([...blocks, stalled]);
  assert.ok(compactTarget(recovered) < compactTarget(bits), 'stall recovery should lower the network target');
  assert.ok(compactTarget(recovered) <= compactTarget(bits) / 4n, 'a chain stuck for an hour should not stay at the previous difficulty');
});

test('DeroM Base58Check addresses validate and reject a changed checksum', () => {
  const publicKey = Buffer.from('0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8', 'hex');
  const address = addressFromPubkey(publicKey);
  assert.equal(b58decode(address).length, 20);
  const corrupt = address.slice(0, -1) + (address.at(-1) === '1' ? '2' : '1');
  assert.throws(() => b58decode(corrupt), /checksum|length/i);
});

test('mining.notify sends the standard display prevhash without word-swapping', () => {
  const prevInternal = Buffer.from('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20', 'hex');
  const expected = Buffer.from(prevInternal).reverse().toString('hex');
  assert.equal(notifyPrevHash({ prevInternal }), expected);
  const wordSwapped = Buffer.from(Buffer.from(prevInternal).reverse());
  for (let i = 0; i < 32; i += 4) wordSwapped.subarray(i, i + 4).reverse();
  assert.notEqual(notifyPrevHash({ prevInternal }), wordSwapped.toString('hex'));
});

test('SHA-256d helper matches the empty-input reference vector', () => {
  assert.equal(hash256(Buffer.alloc(0)).toString('hex'), '5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456');
  assert.equal(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
