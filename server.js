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
const MIN_SHARE_DIFFICULTY = Number(configured('DEROM_MIN_SHARE_DIFFICULTY', fileConfig.stratum?.minimumShareDifficulty, 1000));
if (!Number.isSafeInteger(MIN_SHARE_DIFFICULTY) || MIN_SHARE_DIFFICULTY < 1) throw new Error('Minimum share difficulty must be a positive whole number.');
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
const MIN_BLOCK_TARGET = DIFF1_TARGET / BigInt(MIN_SHARE_DIFFICULTY) < POW_LIMIT
  ? DIFF1_TARGET / BigInt(MIN_SHARE_DIFFICULTY)
  : POW_LIMIT;
let acceptedShares = 0;
let rejectedShares = 0;
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
  const currentTarget = compactTarget(currentBits);
  if (tip.height < 2) return compactFromTarget(MIN_BLOCK_TARGET < currentTarget ? MIN_BLOCK_TARGET : currentTarget);

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

  let adjusted = currentTarget * BigInt(TARGET_SPACING_SECONDS) / weightedAverage;
  const latestInterval = Math.max(1, activeChain[activeChain.length - 1].time - activeChain[activeChain.length - 2].time);
  if (latestInterval > TARGET_SPACING_SECONDS * 3) {
    const recoveryTarget = currentTarget * BigInt(TARGET_SPACING_SECONDS) * 3n / BigInt(latestInterval);
    if (recoveryTarget < adjusted) adjusted = recoveryTarget;
  }

  const minAdjustment = currentTarget / 4n;
  const maxAdjustment = currentTarget * 4n;
  if (adjusted < minAdjustment) adjusted = minAdjustment;
  if (adjusted > maxAdjustment) adjusted = maxAdjustment;
  if (adjusted < 1n) adjusted = 1n;
  if (adjusted > POW_LIMIT) adjusted = POW_LIMIT;
  // Keep network work at least as hard as the Stratum share floor so a valid
  // share can never be discarded by miner firmware before it reaches the node.
  if (adjusted > MIN_BLOCK_TARGET) adjusted = MIN_BLOCK_TARGET;
  return compactFromTarget(adjusted);
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
  const prefix = Buffer.concat([scriptNum(height), ex1]);
  const suffix = Buffer.from('4465726f4d', 'hex');
  const scriptLength = prefix.length + ex2.length + suffix.length;
  const scriptPubKey = scriptForAddress(address);
  const coinb1 = Buffer.concat([u32(1), Buffer.from([1]), Buffer.alloc(32, 0xff), Buffer.from('ffffffff', 'hex'), varInt(scriptLength), prefix]);
  const coinb2 = Buffer.concat([suffix, Buffer.from('ffffffff', 'hex'), Buffer.from([1]), u64(reward), varInt(scriptPubKey.length), scriptPubKey, u32(0)]);
  const raw = Buffer.concat([coinb1, ex2, coinb2]);
  // coinb1 + miner extranonce2 + coinb2 is the canonical full transaction.
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
function notifyPrevHash(job) {
  // Standard Stratum V1: previous hash is sent as the display (big-endian)
  // hex string. Do NOT byte-swap per 32-bit word here; the ASIC must hash
  // the same previous block that the node reconstructs in buildCandidate().
  // A word-swapped prevhash makes the miner work on a different header, so
  // nearly every returned share misses the share target ("Low difficulty
  // share") — and on a fresh chain the network target equals the share
  // floor, so any share that passes also becomes a block.
  return hex(reverse(job.prevInternal));
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
function buildCandidate(job, ex2Hex, timeHex, nonceHex, suppliedVersionHex) {
  if (!/^[0-9a-fA-F]{8}$/.test(ex2Hex) || !/^[0-9a-fA-F]{8}$/.test(timeHex) || !/^[0-9a-fA-F]{8}$/.test(nonceHex)) throw Error('Malformed share fields');
  const ex2 = Buffer.from(ex2Hex, 'hex');
    const coinbase = createCoinbase(job.height, job.address, job.ex1, ex2, job.reward).raw;
  const txid = hash256(coinbase);
  const time = parseInt(timeHex, 16) >>> 0; const nonce = parseInt(nonceHex, 16) >>> 0;
  const version = suppliedVersionHex && /^[0-9a-fA-F]{8}$/.test(suppliedVersionHex) ? parseInt(suppliedVersionHex, 16) >>> 0 : job.version;
  const header = headerFor(job.prevInternal, merkleRoot(coinbase), time, nonce, job.bits, version);
  const rawHash = hash256(header); const hashValue = BigInt('0x' + hex(reverse(rawHash)));
  return { header, coinbase, rawHash, hashValue, time, nonce, txid };
}
function onSubmit(client, id, params) {
  try {
    const [worker, jobId, ex2, ntime, nonce, versionBits] = params;
    if (typeof worker !== 'string' || !worker.startsWith(client.address) || !client.job || jobId !== client.job.id) throw Error('Unknown worker or stale job');
    const job = client.job;
    if (job.tip !== chain[chain.length - 1].id) throw Error('Stale work');
    const candidate = buildCandidate(job, ex2, ntime, nonce, versionBits);
    if (candidate.time <= chain[chain.length - 1].time || candidate.time > Math.floor(Date.now() / 1000) + 7200) throw Error('Block timestamp is outside the allowed range');
    const shareKey = `${jobId}:${ex2}:${ntime}:${nonce}:${versionBits || ''}`;
    if (client.seenShares.has(shareKey)) throw Error('Duplicate share');
    const shareTarget = DIFF1_TARGET / BigInt(MIN_SHARE_DIFFICULTY);
    const networkTarget = compactTarget(job.bits);
    if (candidate.hashValue > shareTarget) throw Error('Low difficulty share');
    client.seenShares.add(shareKey);
    client.acceptedShares++;
    acceptedShares++;
    if (candidate.hashValue > networkTarget) {
      send(client, id, true, null);
      return;
    }
    const block = { height: job.height, id: displayHash(candidate.rawHash), prev: job.tip, time: candidate.time, bits: job.bits.toString(16).padStart(8, '0'), nonce: candidate.nonce, reward: job.reward.toString(), address: job.address, header: hex(candidate.header), coinbase: hex(candidate.coinbase), txid: displayHash(candidate.txid) };
    chain.push(block); saveChain();
    send(client, id, true, null);
    for (const miner of miners) if (miner.authorized && !miner.destroyed) notifyJob(miner, true);
    console.log(`Block ${block.height} accepted: ${block.id} → ${block.address}`);
  } catch (e) {
    rejectedShares++;
    console.log(`Share rejected (${params?.[0] || 'unknown worker'}): ${e.message}`);
    send(client, id, null, { code: -1, message: e.message });
  }
}
function stratumServer() {
  const server = net.createServer(socket => {
    socket.setNoDelay(true);
    const client = { socket, buffer: '', id: crypto.randomBytes(4).toString('hex'), destroyed: false, authorized: false, acceptedShares: 0, seenShares: new Set() };
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
        else if (method === 'mining.configure') send(client, id, { 'version-rolling': false }, null);
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
      return json(res, 200, { name: 'DeroM development chain', network: 'derom-devnet', height: tip.height, tip: tip.id, latest: tip.height ? tip : null, bits: tip.bits, nextBits: nextBits(chain).toString(16).padStart(8, '0'), targetSpacingSeconds: TARGET_SPACING_SECONDS, minimumShareDifficulty: MIN_SHARE_DIFFICULTY, acceptedShares, rejectedShares, nextReward: blockSubsidy().toString(), issuedSupply: issuedSupply().toString(), maxSupply: MAX_SUPPLY.toString(), miners: [...miners].filter(m => m.authorized && !m.destroyed).length, stratum: `stratum+tcp://${ADVERTISE_HOST}:${STRATUM_PORT}`, status: 'development-only' });
    }
    if (req.method === 'GET' && url.pathname === '/api/blocks') return json(res, 200, { blocks: chain.slice(-20).reverse() });
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
}
if (require.main === module) start().catch(error => { console.error(`DeroM startup failed: ${error.message}`); process.exitCode = 1; });

module.exports = {
  compactTarget, compactFromTarget, targetDifficulty, nextBits, hash256,
  addressFromPubkey, b58decode, notifyPrevHash, DIFF1_TARGET, POW_LIMIT,
  MIN_BLOCK_TARGET, MIN_SHARE_DIFFICULTY, TARGET_SPACING_SECONDS
};
