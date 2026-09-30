// DeroM single-node development chain. Not audited or suitable for public funds.
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, 'derom.config.json');
let fileConfig = {};
if (fs.existsSync(CONFIG_FILE)) {
  try { fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch (error) { throw new Error(`Could not read derom.config.json: ${error.message}`); }
  if (!fileConfig || typeof fileConfig !== 'object' || Array.isArray(fileConfig)) throw new Error('derom.config.json must contain a JSON object.');
}
const configured = (env, value, fallback) => process.env[env] ?? value ?? fallback;
const DATA = path.resolve(process.env.DEROM_DATA_DIR || path.join(ROOT, 'data'));
const HTTP_HOST = configured('DEROM_HTTP_HOST', fileConfig.http?.host, '127.0.0.1');
const STRATUM_HOST = configured('DEROM_STRATUM_HOST', fileConfig.stratum?.listenHost, '127.0.0.1');
const HTTP_PORT = Number(configured('DEROM_HTTP_PORT', fileConfig.http?.port, 8080));
const STRATUM_PORT = Number(configured('DEROM_STRATUM_PORT', fileConfig.stratum?.port, 3333));
const LAN_IP = Object.values(os.networkInterfaces()).flat().find(item => item && (item.family === 'IPv4' || item.family === 4) && !item.internal)?.address || '127.0.0.1';
const ADVERTISE_HOST = configured('DEROM_ADVERTISE_HOST', fileConfig.stratum?.advertiseHost, '') || (STRATUM_HOST === '0.0.0.0' ? LAN_IP : STRATUM_HOST);
const REWARD = 250n * 100_000_000n;
const MAX_SUPPLY = 100_000_000n * 100_000_000n;
const POW_LIMIT_BITS = 0x207fffff;
const VERSION = 0x20000000;
const ADDRESS_VERSION = 0x35;
const TARGET_SPACING_SECONDS = Number(configured('DEROM_TARGET_SPACING_SECONDS', fileConfig.consensus?.targetSpacingSeconds, 300));
if (!Number.isInteger(TARGET_SPACING_SECONDS) || TARGET_SPACING_SECONDS < 30 || TARGET_SPACING_SECONDS > 86_400) throw new Error('Block target spacing must be a whole number from 30 to 86400 seconds.');
const DEFAULT_SHARE_DIFFICULTY = 32;
const MIN_SHARE_DIFFICULTY = Number(configured('DEROM_MIN_SHARE_DIFFICULTY', fileConfig.stratum?.minimumShareDifficulty, DEFAULT_SHARE_DIFFICULTY));
if (!Number.isSafeInteger(MIN_SHARE_DIFFICULTY) || MIN_SHARE_DIFFICULTY < 1 || MIN_SHARE_DIFFICULTY > 1000000) throw new Error('Minimum share difficulty must be a whole number from 1 to 1000000.');
for (const [label, port] of [['HTTP', HTTP_PORT], ['Stratum', STRATUM_PORT]]) if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`${label} port must be between 1 and 65535.`);
if (!['127.0.0.1', '::1', 'localhost'].includes(HTTP_HOST)) throw new Error('Unauthenticated dashboard/RPC must bind to loopback only. Keep http.host at 127.0.0.1 until RPC authentication is implemented.');
const BLOCKS_FILE = path.join(DATA, 'blocks.json');
const WALLETS_DIR = path.join(DATA, 'wallets');
const MAX_BODY = 16 * 1024;
const miners = new Set();
let chain;

const sha256 = b => crypto.createHash('sha256').update(b).digest();
const hash256 = b => sha256(sha256(b));
const hash160 = b => crypto.createHash('ripemd160').update(sha256(b)).digest();
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const varInt = n => n < 0xfd ? Buffer.from([n]) : n <= 0xffff ? Buffer.from([0xfd, n & 255, n >> 8]) : Buffer.from([0xfe, n & 255, n >> 8 & 255, n >> 16 & 255, n >>> 24]);
const reverse = b => Buffer.from(b).reverse();
const hex = b => Buffer.from(b).toString('hex');
function displayHash(raw) { return hex(reverse(raw)); }
function compactTarget(bits) {
  const size = bits >>> 24; const word = bits & 0x007fffff;
  return size <= 3 ? BigInt(word >>> (8 * (3 - size))) : BigInt(word) << BigInt(8 * (size - 3));
}
const POW_LIMIT = compactTarget(POW_LIMIT_BITS);
const DIFF1_TARGET = compactTarget(0x1d00ffff);
// Two different targets, and the ORDER between them is the whole game.
// A target is inverted: numerically bigger means easier. So a share must carry
// the larger (easier) threshold and a block the smaller (harder) one:
//
//     block target  <=  share target  <=  POW_LIMIT
//
// If the network target is ever allowed above the share target, every accepted
// share automatically satisfies the network target too and instantly becomes a
// block. That is exactly what happened while the chain sat at POW_LIMIT, which
// is ~6.9e10 times easier than a difficulty-32 share.
const SHARE_TARGET = DIFF1_TARGET / BigInt(MIN_SHARE_DIFFICULTY);
const MAX_BLOCK_TARGET = SHARE_TARGET < POW_LIMIT ? SHARE_TARGET : POW_LIMIT;
function clampBlockTarget(target) {
  let value = target < 1n ? 1n : target;
  if (value > MAX_BLOCK_TARGET) value = MAX_BLOCK_TARGET;
  if (value > POW_LIMIT) value = POW_LIMIT;
  return value;
}
// A fresh chain starts here rather than at the share floor, so the first blocks
// are not minted one per second while the retarget calibrates to the miner.
// The retarget moves away from this within a handful of blocks.
const START_DIFFICULTY = Number(configured('DEROM_START_DIFFICULTY', fileConfig.consensus?.startDifficulty, 4096));
if (!Number.isSafeInteger(START_DIFFICULTY) || START_DIFFICULTY <= MIN_SHARE_DIFFICULTY) throw new Error(`consensus.startDifficulty must be a whole number strictly above the share difficulty (${MIN_SHARE_DIFFICULTY}), otherwise every share would also be a block.`);
const START_BLOCK_TARGET = clampBlockTarget(DIFF1_TARGET / BigInt(START_DIFFICULTY));
let acceptedShares = 0;
let rejectedShares = 0;
const recentShares = [];
function recordShare(entry) {
  recentShares.unshift(entry);
  if (recentShares.length > 12) recentShares.pop();
}
function shareDifficultyOf(hashValue) {
  return Number(DIFF1_TARGET) / Number(hashValue);
}
function targetDifficulty(bits) {
  return Number(DIFF1_TARGET) / Number(compactTarget(bits));
}
function compactFromTarget(value) {
  let target = value;
  let hexValue = target.toString(16);
  let size = Math.ceil(hexValue.length / 2);
  let compact = size <= 3
    ? Number(target << BigInt(8 * (3 - size)))
    : Number(target >> BigInt(8 * (size - 3)));
  if (compact & 0x00800000) { compact >>>= 8; size++; }
  return (((size << 24) | (compact & 0x007fffff)) >>> 0);
}
function nextBits(activeChain = chain) {
  const tip = activeChain[activeChain.length - 1];
  const currentBits = parseInt(tip.bits, 16) >>> 0;
  const currentTarget = clampBlockTarget(compactTarget(currentBits));
  if (tip.height < 2) {
    const startTarget = START_BLOCK_TARGET < currentTarget ? START_BLOCK_TARGET : currentTarget;
    return compactFromTarget(startTarget);
  }

  const window = 12;
  const intervals = [];
  const first = Math.max(1, activeChain.length - window);
  for (let i = first; i < activeChain.length; i++) {
    intervals.push(Math.max(1, activeChain[i].time - activeChain[i - 1].time));
  }

  let weightedTotal = 0n;
  let weightTotal = 0n;
  for (let index = 0; index < intervals.length; index++) {
    const weight = BigInt(index + 1);
    weightedTotal += BigInt(intervals[index]) * weight;
    weightTotal += weight;
  }
  const weightedAverage = weightTotal === 0n ? BigInt(TARGET_SPACING_SECONDS) : weightedTotal / weightTotal;

  // Targets are inverted, so the ratio goes actual-over-expected. Blocks that
  // arrive faster than TARGET_SPACING_SECONDS (weightedAverage < target) make
  // the target SMALLER = harder; a stalled chain makes it BIGGER = easier.
  // Multiplying the other way (expected-over-actual) makes the chain run away:
  // fast blocks would make it easier, so difficulty could never rise.
  const adjusted = currentTarget * weightedAverage / BigInt(TARGET_SPACING_SECONDS);

  const minAdjustment = currentTarget / 4n;
  const maxAdjustment = currentTarget * 4n;
  let target = adjusted;
  if (target < minAdjustment) target = minAdjustment;
  if (target > maxAdjustment) target = maxAdjustment;
  // Hard ceiling: a block must always stay harder than a share, or every share
  // would be a block. Hard floor: keep the number positive.
  target = clampBlockTarget(target);
  return compactFromTarget(target);
}
function b58encode(input) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt('0x' + input.toString('hex')); let out = '';
  while (n > 0n) { out = alphabet[Number(n % 58n)] + out; n /= 58n; }
  for (const byte of input) { if (byte !== 0) break; out = '1' + out; }
  return out || '1';
}
function b58decode(s) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const c of s) { const i = alphabet.indexOf(c); if (i < 0) throw Error('Invalid address'); n = n * 58n + BigInt(i); }
  let body = n === 0n ? Buffer.alloc(0) : Buffer.from(n.toString(16).padStart(n.toString(16).length + n.toString(16).length % 2, '0'), 'hex');
  let zeros = 0; while (s[zeros] === '1') zeros++;
  body = Buffer.concat([Buffer.alloc(zeros), body]);
  if (body.length !== 25) throw Error('Invalid DeroM address length');
  const payload = body.subarray(0, 21); const check = body.subarray(21);
  if (!crypto.timingSafeEqual(check, hash256(payload).subarray(0, 4))) throw Error('Address checksum mismatch');
  if (payload[0] !== ADDRESS_VERSION) throw Error('Address belongs to another network');
  return payload.subarray(1);
}
function addressFromPubkey(pub) {
  const payload = Buffer.concat([Buffer.from([ADDRESS_VERSION]), hash160(pub)]);
  return b58encode(Buffer.concat([payload, hash256(payload).subarray(0, 4)]));
}
function scriptForAddress(address) {
  const keyHash = b58decode(address);
  return Buffer.concat([Buffer.from('76a914', 'hex'), keyHash, Buffer.from('88ac', 'hex')]);
}
function scriptNum(n) {
  let v = BigInt(n); const bytes = [];
  while (v > 0n) { bytes.push(Number(v & 255n)); v >>= 8n; }
  if (bytes.length === 0) bytes.push(0);
  if (bytes[bytes.length - 1] & 0x80) bytes.push(0);
  return Buffer.concat([Buffer.from([bytes.length]), Buffer.from(bytes)]);
}
function merkleRoot(coinbase) {
  let h = hash256(coinbase);
  while (h.length !== 32) throw Error('Invalid transaction hash');
  return h;
}
function headerFor(prevRaw, merkle, time, nonce, bits, version = VERSION) {
  return Buffer.concat([u32(version), prevRaw, merkle, u32(time), u32(bits), u32(nonce)]);
}
function genesis() {
  const timestamp = 1780000000;
  const seed = Buffer.from('DeroM development genesis · no premine', 'utf8');
  const header = Buffer.concat([u32(VERSION), Buffer.alloc(32), hash256(seed), u32(timestamp), u32(POW_LIMIT_BITS), u32(0)]);
  const id = displayHash(hash256(header));
  return { height: 0, id, prev: '0'.repeat(64), time: timestamp, bits: POW_LIMIT_BITS.toString(16).padStart(8, '0'), nonce: 0, reward: '0', address: '', header: hex(header), coinbase: hex(seed) };
}
function loadChain() {
  fs.mkdirSync(WALLETS_DIR, { recursive: true });
  if (!fs.existsSync(BLOCKS_FILE)) {
    chain = [genesis()]; saveChain(); return;
  }
  const parsed = JSON.parse(fs.readFileSync(BLOCKS_FILE, 'utf8'));
  if (!Array.isArray(parsed) || !parsed.length || parsed[0].height !== 0) throw Error('Invalid chain database');
  chain = parsed;
}
function saveChain() {
  const tmp = BLOCKS_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(chain, null, 2)); fs.renameSync(tmp, BLOCKS_FILE);
}
function pubkeyBytes(publicKey) {
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const pub = der.subarray(der.length - 65);
  if (pub.length !== 65 || pub[0] !== 4) throw Error('Unexpected secp256k1 public key');
  return pub;
}
function createWallet(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) throw Error('Use a wallet passphrase of at least 12 characters');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const pub = pubkeyBytes(publicKey); const address = addressFromPubkey(pub);
  const salt = crypto.randomBytes(16); const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const privatePem = Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' }));
  const ciphertext = Buffer.concat([cipher.update(privatePem), cipher.final()]);
  const backup = { format: 'DeroM encrypted wallet backup', version: 1, network: 'derom-devnet', address, publicKey: hex(pub), kdf: 'scrypt-N32768-r8-p1', salt: hex(salt), cipher: 'AES-256-GCM', iv: hex(iv), tag: hex(cipher.getAuthTag()), ciphertext: hex(ciphertext) };
  const file = path.join(WALLETS_DIR, address + '.json');
  fs.writeFileSync(file, JSON.stringify(backup, null, 2), { flag: 'wx', mode: 0o600 });
  return { address, publicKey: hex(pub), backup };
}
function issuedSupply() { return chain.reduce((sum, block) => sum + BigInt(block.reward || '0'), 0n); }
function blockSubsidy() { const remaining = MAX_SUPPLY - issuedSupply(); return remaining > 0n ? (remaining < REWARD ? remaining : REWARD) : 0n; }
function createCoinbase(height, address, ex1, ex2, reward = blockSubsidy()) {
  // Standard Stratum V1 assembly: the miner builds the transaction itself as
  //   coinb1 + extranonce1 + extranonce2 + coinb2
  // so coinb1 must stop BEFORE the pool extranonce. Embedding ex1 in coinb1
  // made the ASIC's copy carry the extranonce twice and disagree with the
  // input-script length byte, so the ASIC's merkle root never matched the one
  // this node reconstructed and every share measured ~1e-10.
  const heightPush = scriptNum(height);
  const suffix = Buffer.from('4465726f4d', 'hex');
  const scriptLength = heightPush.length + ex1.length + ex2.length + suffix.length;
  const scriptPubKey = scriptForAddress(address);
  const coinb1 = Buffer.concat([u32(1), Buffer.from([1]), Buffer.alloc(32, 0xff), Buffer.from('ffffffff', 'hex'), varInt(scriptLength), heightPush]);
  const coinb2 = Buffer.concat([suffix, Buffer.from('ffffffff', 'hex'), Buffer.from([1]), u64(reward), varInt(scriptPubKey.length), scriptPubKey, u32(0)]);
  const raw = Buffer.concat([coinb1, ex1, ex2, coinb2]);
  // coinb1 + extranonce1 + miner extranonce2 + coinb2 is the canonical full
  // transaction, byte for byte the same one an ASIC assembles from the job.
  return { coinb1, coinb2, raw };
}
function nextJob(address, ex1) {
  const tip = chain[chain.length - 1]; const height = tip.height + 1;
  const bits = nextBits(chain);
  const ex2size = 4;
  const ex2zero = Buffer.alloc(ex2size);
  const reward = blockSubsidy();
  const cb = createCoinbase(height, address, ex1, ex2zero, reward);
  const prevInternal = reverse(Buffer.from(tip.id, 'hex'));
  const now = Math.max(Math.floor(Date.now() / 1000), tip.time + 1);
  return { id: crypto.randomBytes(8).toString('hex'), height, address, ex1, ex2size, reward, coinb1: cb.coinb1, coinb2: cb.coinb2, prevInternal, time: now, tip: tip.id, bits, version: VERSION };
}
function wordBytes(input) {
  // Reverses the bytes inside every 32-bit word. Deliberately does not touch
  // `input`: Buffer.subarray() is a view, so .reverse() on it would rewrite the
  // caller's buffer (e.g. job.prevInternal) in place.
  const out = Buffer.alloc(input.length);
  for (let i = 0; i + 3 < input.length; i += 4) {
    out[i] = input[i + 3];
    out[i + 1] = input[i + 2];
    out[i + 2] = input[i + 1];
    out[i + 3] = input[i];
  }
  for (let i = input.length - (input.length % 4); i < input.length; i++) out[i] = input[i];
  return out;
}
function notifyPrevHash(job) {
  // Hardware-verified with a Bitaxe on the wire: the firmware byte-reverses
  // every 32-bit word of the notified prevhash before hashing, so the job must
  // carry the form that becomes the node's internal prevhash under that swap.
  // Sending the plain display hash makes the ASIC mine a different header and
  // every submit comes back as "Low difficulty share" (measured ~1e-10 instead
  // of the few hundred the ASIC really found). The same shares measured
  // 290-15700 once this ordering matched.
  return hex(wordBytes(job.prevInternal));
}
function notifyJob(client, clean = true) {
  const job = nextJob(client.address, Buffer.from(client.id, 'hex')); client.job = job;
  client.seenShares = new Set();
  send(client, null, 'mining.set_difficulty', [MIN_SHARE_DIFFICULTY]);
  send(client, null, 'mining.notify', [job.id, notifyPrevHash(job), hex(job.coinb1), hex(job.coinb2), [], job.version.toString(16).padStart(8, '0'), job.bits.toString(16).padStart(8, '0'), job.time.toString(16).padStart(8, '0'), clean]);
}
function send(client, id, methodOrResult, paramsOrError) {
  if (client.destroyed) return;
  const message = typeof methodOrResult === 'string'
    ? { id, method: methodOrResult, params: paramsOrError }
    : { id, result: methodOrResult, error: paramsOrError || null };
  client.socket.write(JSON.stringify(message) + '\n');
}
// Version rolling (BIP 310 style). Bitaxe / BM1366 firmware rolls bits inside
// this mask and submits only the changed bits, even when a pool answers
// mining.configure with version-rolling disabled. A submitted value that stays
// inside the mask is therefore rolled bits to merge into the job version; a
// value with bits outside the mask can only be a complete version field,
// because those bits are not miner-changeable. Treating rolled bits as a whole
// version field makes the node hash a different header than the ASIC, so every
// share comes back as "Low difficulty share".
const VERSION_ROLLING_MASK = 0x1fffe000;
function versionFor(job, suppliedVersionHex, versionMask = 0) {
  if (!suppliedVersionHex || !/^[0-9a-fA-F]{8}$/.test(suppliedVersionHex)) return job.version;
  const supplied = parseInt(suppliedVersionHex, 16) >>> 0;
  const mask = ((versionMask || VERSION_ROLLING_MASK) & VERSION_ROLLING_MASK) >>> 0;
  if ((supplied & ~mask) === 0) return ((job.version & ~mask) | supplied) >>> 0;
  return supplied;
}
function buildCandidate(job, ex2Hex, timeHex, nonceHex, suppliedVersionHex, versionMask = 0) {
  if (!/^[0-9a-fA-F]{8}$/.test(ex2Hex) || !/^[0-9a-fA-F]{8}$/.test(timeHex) || !/^[0-9a-fA-F]{8}$/.test(nonceHex)) throw Error('Malformed share fields');
  const ex2 = Buffer.from(ex2Hex, 'hex');
    const coinbase = createCoinbase(job.height, job.address, job.ex1, ex2, job.reward).raw;
  const txid = hash256(coinbase);
  const time = parseInt(timeHex, 16) >>> 0; const nonce = parseInt(nonceHex, 16) >>> 0;
  const version = versionFor(job, suppliedVersionHex, versionMask);
  const header = headerFor(job.prevInternal, merkleRoot(coinbase), time, nonce, job.bits, version);
  const rawHash = hash256(header); const hashValue = BigInt('0x' + hex(reverse(rawHash)));
  return { header, coinbase, rawHash, hashValue, time, nonce, txid, version };
}
function onSubmit(client, id, params) {
  const [worker, jobId, ex2, ntime, nonce, versionBits] = params || {};
  let job = null;
  let candidate = null;
  // Keep a short ring of the last share attempts. A miner that believes it
  // found difficulty 1000 while the node measures ~1e-14 is hashing a
  // different header, which is how prevhash/coinbase mismatches show up.
  const describe = (accepted, reason) => ({
    accepted,
    reason: reason || null,
    worker: typeof worker === 'string' ? worker : null,
    jobId: jobId || null,
    extranonce2: ex2 || null,
    ntime: ntime || null,
    nonce: nonce || null,
    versionBit: versionBits || null,
    headerVersion: candidate ? candidate.version.toString(16).padStart(8, '0') : null,
    hash: candidate ? displayHash(candidate.rawHash) : null,
    measuredDifficulty: candidate ? shareDifficultyOf(candidate.hashValue) : null,
    requiredShareDifficulty: MIN_SHARE_DIFFICULTY,
    jobBits: job ? job.bits.toString(16).padStart(8, '0') : null,
    // Enough of the job to rebuild the header elsewhere and compare byte for
    // byte with whatever convention a given ASIC firmware actually uses.
    job: job ? { id: job.id, height: job.height, prevhash: hex(reverse(job.prevInternal)), coinb1: hex(job.coinb1), coinb2: hex(job.coinb2), version: job.version.toString(16).padStart(8, '0'), bits: job.bits.toString(16).padStart(8, '0'), time: job.time, extranonce1: hex(job.ex1), extranonce2Size: job.ex2size, address: job.address } : null,
    at: Math.floor(Date.now() / 1000)
  });
  try {
    if (typeof worker !== 'string' || !worker.startsWith(client.address) || !client.job || jobId !== client.job.id) throw Error('Unknown worker or stale job');
    job = client.job;
    if (job.tip !== chain[chain.length - 1].id) throw Error('Stale work');
    candidate = buildCandidate(job, ex2, ntime, nonce, versionBits, client.versionMask);
    if (candidate.time <= chain[chain.length - 1].time || candidate.time > Math.floor(Date.now() / 1000) + 7200) throw Error('Block timestamp is outside the allowed range');
    const shareKey = `${jobId}:${ex2}:${ntime}:${nonce}:${versionBits || ''}`;
    if (client.seenShares.has(shareKey)) throw Error('Duplicate share');
    const shareTarget = SHARE_TARGET;
    const networkTarget = clampBlockTarget(compactTarget(job.bits));
    if (candidate.hashValue > shareTarget) throw Error('Low difficulty share');
    client.seenShares.add(shareKey);
    client.acceptedShares++;
    acceptedShares++;
    // Accepted share, and only this one branch can create a block: the hash
    // must also clear the harder network target, not just the share target.
    if (candidate.hashValue > networkTarget) {
      recordShare(describe(true, null));
      send(client, id, true, null);
      return;
    }
    const block = { height: job.height, id: displayHash(candidate.rawHash), prev: job.tip, time: candidate.time, bits: job.bits.toString(16).padStart(8, '0'), nonce: candidate.nonce, reward: job.reward.toString(), address: job.address, header: hex(candidate.header), coinbase: hex(candidate.coinbase), txid: displayHash(candidate.txid) };
    chain.push(block); saveChain();
    recordShare(describe(true, 'block'));
    send(client, id, true, null);
    for (const miner of miners) if (miner.authorized && !miner.destroyed) notifyJob(miner, true);
    console.log(`Block ${block.height} accepted: ${block.id} → ${block.address}`);
  } catch (e) {
    rejectedShares++;
    recordShare(describe(false, e.message));
    const measured = candidate ? ` (node measured difficulty ${shareDifficultyOf(candidate.hashValue).toExponential(2)}, needed ${MIN_SHARE_DIFFICULTY})` : '';
    console.log(`Share rejected (${typeof worker === 'string' ? worker : 'unknown worker'}): ${e.message}${measured}`);
    send(client, id, null, { code: -1, message: e.message });
  }
}
function stratumServer() {
  const server = net.createServer(socket => {
    socket.setNoDelay(true);
    const client = { socket, buffer: '', id: crypto.randomBytes(4).toString('hex'), destroyed: false, authorized: false, acceptedShares: 0, versionMask: 0, seenShares: new Set() };
    miners.add(client);
    socket.on('close', () => { client.destroyed = true; miners.delete(client); });
    socket.on('error', () => { client.destroyed = true; miners.delete(client); });
    socket.on('data', chunk => {
      client.buffer += chunk.toString('utf8');
      if (client.buffer.length > 64 * 1024) { socket.destroy(); return; }
      let end;
      while ((end = client.buffer.indexOf('\n')) >= 0) {
        const line = client.buffer.slice(0, end).trim(); client.buffer = client.buffer.slice(end + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { send(client, null, 'client.show_message', ['Invalid JSON message']); continue; }
        const { id, method, params = [] } = msg;
        if (method === 'mining.subscribe') {
          send(client, id, [[['mining.set_difficulty', client.id], ['mining.notify', client.id]], client.id, 4], null);
        } else if (method === 'mining.authorize') {
          try {
            const user = String(params[0] || '').split('.')[0]; scriptForAddress(user);
            client.address = user; client.authorized = true; send(client, id, true, null); notifyJob(client, true);
          } catch { send(client, id, false, { code: 24, message: 'Invalid DeroM development address' }); }
        } else if (method === 'mining.submit') onSubmit(client, id, params);
        else if (method === 'mining.configure') {
          // Negotiate version rolling instead of refusing it: firmware that is
          // already rolling bits must get the agreed mask back, otherwise its
          // shares can never be reproduced by this node.
          const requested = Array.isArray(params) ? params[0] : params;
          const wantsRolling = !!requested && requested['version-rolling'] === true;
          const requestedMask = requested && typeof requested['version-rolling.mask'] === 'string' ? requested['version-rolling.mask'] : '';
          const mask = wantsRolling && /^[0-9a-fA-F]{1,8}$/.test(requestedMask)
            ? (parseInt(requestedMask, 16) & VERSION_ROLLING_MASK) >>> 0
            : (wantsRolling ? VERSION_ROLLING_MASK : 0);
          client.versionMask = mask;
          send(client, id, mask ? { 'version-rolling': true, 'version-rolling.mask': mask.toString(16).padStart(8, '0') } : { 'version-rolling': false }, null);
        }
        else if (method === 'mining.extranonce.subscribe') send(client, id, true, null);
        else if (method === 'mining.ping') send(client, id, true, null);
        else send(client, id, null, { code: 20, message: 'Unsupported Stratum method' });
      }
    });
  });
  return server;
}
function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body)); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': data.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''; let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      data += chunk;
      if (Buffer.byteLength(data) > MAX_BODY) { tooLarge = true; reject(Error('Request too large')); }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try { resolve(JSON.parse(data || '{}')); } catch { reject(Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}
function balance(address) {
  const reward = chain.filter(b => b.address === address).reduce((sum, b) => sum + BigInt(b.reward), 0n);
  return reward.toString();
}
async function api(req, res, url) {
  try {
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const tip = chain[chain.length - 1];
      const upcoming = nextBits(chain);
      return json(res, 200, { name: 'DeroM development chain', network: 'derom-devnet', height: tip.height, tip: tip.id, latest: tip.height ? tip : null, bits: tip.bits, nextBits: upcoming.toString(16).padStart(8, '0'), difficulty: Math.round(targetDifficulty(upcoming) * 100) / 100, targetSpacingSeconds: TARGET_SPACING_SECONDS, minimumShareDifficulty: MIN_SHARE_DIFFICULTY, startDifficulty: START_DIFFICULTY, acceptedShares, rejectedShares, nextReward: blockSubsidy().toString(), issuedSupply: issuedSupply().toString(), maxSupply: MAX_SUPPLY.toString(), miners: [...miners].filter(m => m.authorized && !m.destroyed).length, stratum: `stratum+tcp://${ADVERTISE_HOST}:${STRATUM_PORT}`, status: 'development-only' });
    }
    if (req.method === 'GET' && url.pathname === '/api/blocks') return json(res, 200, { blocks: chain.slice(-20).reverse() });
    if (req.method === 'GET' && url.pathname === '/api/shares') return json(res, 200, { minimumShareDifficulty: MIN_SHARE_DIFFICULTY, blockDifficulty: Math.round(targetDifficulty(nextBits(chain)) * 100) / 100, acceptedShares, rejectedShares, recent: recentShares });
    if (req.method === 'GET' && url.pathname.startsWith('/api/balance/')) {
      const address = decodeURIComponent(url.pathname.slice('/api/balance/'.length)); scriptForAddress(address);
      return json(res, 200, { address, atomicUnits: balance(address) });
    }
    if (req.method === 'POST' && url.pathname === '/api/wallet/create') {
      const body = await readBody(req); const created = createWallet(body.passphrase);
      return json(res, 201, { address: created.address, publicKey: created.publicKey, atomicUnits: balance(created.address), backup: created.backup, warning: 'Store the encrypted backup and remember the passphrase. The passphrase cannot be recovered.' });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/wallet/backup/')) {
      const address = decodeURIComponent(url.pathname.slice('/api/wallet/backup/'.length)); scriptForAddress(address);
      const file = path.join(WALLETS_DIR, address + '.json');
      if (!fs.existsSync(file)) return json(res, 404, { error: 'Wallet backup not found on this node' });
      return json(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')));
    }
    json(res, 404, { error: 'Not found' });
  } catch (e) { json(res, 400, { error: e.message || 'Bad request' }); }
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
function webServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return api(req, res, url);
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!['index.html', 'styles.css', 'forms.css', 'app.js'].includes(requested)) return json(res, 404, { error: 'Not found' });
    const file = path.join(ROOT, requested);
    try { const data = fs.readFileSync(file); res.writeHead(200, { 'content-type': MIME[path.extname(file)], 'content-length': data.length, 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" }); res.end(data); }
    catch { json(res, 500, { error: 'Could not load UI' }); }
  });
}
function listen(server, host, port, label) {
  return new Promise((resolve, reject) => {
    const onError = error => { server.off('listening', onListening); reject(Object.assign(error, { serviceLabel: label })); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError); server.once('listening', onListening); server.listen(port, host);
  });
}
async function start() {
  loadChain();
  const dashboard = webServer();
  const stratum = stratumServer();
  try {
    // Claim the dashboard port first. A second instance then exits before opening Stratum.
    await listen(dashboard, HTTP_HOST, HTTP_PORT, 'dashboard');
    await listen(stratum, STRATUM_HOST, STRATUM_PORT, 'Stratum');
  } catch (error) {
    if (dashboard.listening) dashboard.close();
    if (stratum.listening) stratum.close();
    if (error.code === 'EADDRINUSE') {
      const port = error.port || (error.serviceLabel === 'dashboard' ? HTTP_PORT : STRATUM_PORT);
      console.error(`DeroM did not start: ${error.serviceLabel || 'a service'} port ${port} is already in use.`);
      console.error('If another DeroM window is open, press Ctrl+C in that window, then launch this one again. Do not run start.bat and start-lan.bat at the same time.');
    } else console.error(`DeroM did not start: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Development chain ready at height ${chain[chain.length - 1].height}; fixed 250 DERM subsidy until the 100,000,000 DERM issuance cap.`);
  console.log(`DeroM local dashboard: http://${HTTP_HOST}:${HTTP_PORT}`);
  console.log(`Stratum V1 listening on ${STRATUM_HOST}:${STRATUM_PORT}`);
  console.log(`Shares must reach difficulty ${MIN_SHARE_DIFFICULTY}; the block target starts at difficulty ${START_DIFFICULTY} and retargets toward ${TARGET_SPACING_SECONDS}s spacing. Blocks are always harder than shares.`);
}
if (require.main === module) start().catch(error => { console.error(`DeroM startup failed: ${error.message}`); process.exitCode = 1; });

module.exports = {
  compactTarget, compactFromTarget, targetDifficulty, shareDifficultyOf, nextBits, hash256, createCoinbase,
  addressFromPubkey, b58decode, notifyPrevHash, DIFF1_TARGET, POW_LIMIT,
  POW_LIMIT_BITS, SHARE_TARGET, MAX_BLOCK_TARGET, clampBlockTarget,
  versionFor, VERSION_ROLLING_MASK,
  MIN_SHARE_DIFFICULTY, START_DIFFICULTY, START_BLOCK_TARGET,
  TARGET_SPACING_SECONDS
};
