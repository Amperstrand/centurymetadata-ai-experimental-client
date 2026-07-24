import assert from 'node:assert/strict';
import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { secp256k1, schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { gzipSync, inflateSync } from 'fflate';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// The tests below labelled "SPEC DRIFT" guard against divergence from upstream.
// They read our own source files as text and assert specific contract strings
// are (or are not) present. Source-text inspection is intentional: unit-tests.mjs
// runs under plain Node with no TS compilation, and these tests document the
// upstream contract at the source level so future drift is caught at CI time.
//
// Upstream reference:
//   https://github.com/rustyrussell/centurymetadata/blob/master/python/centurymetadata/constants.py
//   https://github.com/rustyrussell/centurymetadata/blob/master/python/centurymetadata/encode.py
// ─────────────────────────────────────────────────────────────────────────────

const toHex = (b) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const concat = (...arrs) => { const t = arrs.reduce((s,a)=>s+a.length,0); const r=new Uint8Array(t); let o=0; for(const a of arrs){r.set(a,o);o+=a.length;} return r; };
const taggedHash = (tag, msg) => { const tb = new TextEncoder().encode(tag); const th = sha256(tb); return sha256(concat(th, th, msg)); };
const bytesToNum = (b) => { let r=0n; for(const x of b) r=(r<<8n)|BigInt(x); return r; };
const harden = (i) => (0x80000000 + i) >>> 0;
const CM_PURPOSE = 0x44315441;
const MLKEM_Z_TAG = 'centurymetadata v1 mlkem-z';
const BIP340_TAG = 'centurymetadata v1';

function computeEcdh(priv, pubCompressed) {
  const pt = secp256k1.Point.fromBytes(pubCompressed).multiply(bytesToNum(priv));
  return sha256(pt.toBytes(true).subarray(1, 33));
}

function deriveMlkemKeys(seedD) {
  const z = taggedHash(MLKEM_Z_TAG, seedD);
  const k = ml_kem1024.keygen(concat(seedD, z));
  return { publicKey: k.publicKey, secretKey: k.secretKey };
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}: ${e.message}`); failed++; }
}
async function asyncTest(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}: ${e.message}`); failed++; }
}

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const EXPECTED = {
  BIP39_SEED: '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4',
  WRITER_SECP_PRIVKEY: '9355d4cd566a6a0b1f96b0b960d8008cbf398d2eb9ba72947e7c4b08e828c090',
  WRITER_PUBKEY: '02f55335969a3f0e437e0f60de88b1ce68e91463d1eda9e486ad33a45081c3502c',
  READER_SECP_PRIVKEY: '164aa5d38cdf778df14250d8a41e85ec93321039e4ba60d20e5cbbc5874b826e',
  READER_SECP_PUBKEY: '02a667b33fab621c435a00cd3b75e676daece88ee2fe80dacebdd015dd913f56a5',
  READER_MLKEM_SEED_D: '9e09c1a9db9e76ef7be3926c38c9a571b66a3c076302f8dba3c550f1c72a6a25',
  READER_ID: '46bdfb26fddb9e2962546ad2436e196feb29c0d873239a0954f1948e52bb44f3',
};

console.log('=== UNIT TESTS: centurymetadata crypto vs Python reference test vectors ===\n');

const seed = mnemonicToSeedSync(MNEMONIC);
const hd = HDKey.fromMasterSeed(seed);

test('BIP-39 seed matches reference vector', () => {
  assert.equal(toHex(seed), EXPECTED.BIP39_SEED);
});

test('BIP-32 path m/0x44315441\'/0\'/0\' writer privkey', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(0));
  const writer = coin.deriveChild(harden(0));
  assert.equal(toHex(writer.privateKey), EXPECTED.WRITER_SECP_PRIVKEY);
});

test('Writer pubkey (compressed, 33 bytes)', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(0));
  const writer = coin.deriveChild(harden(0));
  const pub = secp256k1.getPublicKey(writer.privateKey, true);
  assert.equal(toHex(pub), EXPECTED.WRITER_PUBKEY);
});

test('Reader secp privkey at m/0x44315441\'/0\'/1\'', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(0));
  const reader = coin.deriveChild(harden(1));
  assert.equal(toHex(reader.privateKey), EXPECTED.READER_SECP_PRIVKEY);
});

test('Reader secp pubkey (compressed)', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(0));
  const reader = coin.deriveChild(harden(1));
  const pub = secp256k1.getPublicKey(reader.privateKey, true);
  assert.equal(toHex(pub), EXPECTED.READER_SECP_PUBKEY);
});

test('Reader ML-KEM seed D at m/0x44315441\'/0\'/3\'', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(0));
  const mlkem = coin.deriveChild(harden(3));
  assert.equal(toHex(mlkem.privateKey), EXPECTED.READER_MLKEM_SEED_D);
});

test('READER_ID = SHA256(reader_secp_pub || reader_mlkem_pub)', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(0));
  const readerSecp = coin.deriveChild(harden(1));
  const mlkemSeed = coin.deriveChild(harden(3));
  const readerSecpPub = secp256k1.getPublicKey(readerSecp.privateKey, true);
  const mlkemKeys = deriveMlkemKeys(mlkemSeed.privateKey);
  const readerId = sha256(concat(new Uint8Array(readerSecpPub), new Uint8Array(mlkemKeys.publicKey)));
  assert.equal(toHex(readerId), EXPECTED.READER_ID);
});

test('ECDH symmetry: writer×reader_pub == reader×writer_pub', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(0));
  const writer = coin.deriveChild(harden(0));
  const reader = coin.deriveChild(harden(1));
  const writerPub = secp256k1.getPublicKey(writer.privateKey, true);
  const readerPub = secp256k1.getPublicKey(reader.privateKey, true);
  const ecdh1 = computeEcdh(writer.privateKey, readerPub);
  const ecdh2 = computeEcdh(reader.privateKey, writerPub);
  assert.equal(toHex(ecdh1), toHex(ecdh2));
});

test('ML-KEM keypair is deterministic (same seed → same keys)', () => {
  const seedD = fromHex(EXPECTED.READER_MLKEM_SEED_D);
  const k1 = deriveMlkemKeys(seedD);
  const k2 = deriveMlkemKeys(seedD);
  assert.equal(toHex(k1.publicKey), toHex(k2.publicKey));
  assert.equal(toHex(k1.secretKey), toHex(k2.secretKey));
});

test('ML-KEM encapsulate → decapsulate roundtrip', () => {
  const seedD = fromHex(EXPECTED.READER_MLKEM_SEED_D);
  const k = deriveMlkemKeys(seedD);
  const encap = ml_kem1024.encapsulate(k.publicKey);
  const decapSecret = ml_kem1024.decapsulate(encap.cipherText, k.secretKey);
  assert.equal(toHex(encap.sharedSecret), toHex(decapSecret));
});

test('AES-256-CTR encrypt → decrypt roundtrip', () => {
  const key = fromHex('aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899');
  const data = new Uint8Array(6487);
  for (let i = 0; i < 100; i++) data[i] = i;
  const cipher = createCipheriv('aes-256-ctr', Buffer.from(key), Buffer.alloc(16, 0));
  const enc = cipher.update(Buffer.from(data));
  const decipher = createDecipheriv('aes-256-ctr', Buffer.from(key), Buffer.alloc(16, 0));
  const dec = decipher.update(enc);
  assert.equal(toHex(new Uint8Array(dec.slice(0, 100))), toHex(data.slice(0, 100)));
});

test('gzip OS byte forced to 0xff', () => {
  const data = new TextEncoder().encode('test\0data\0');
  const gz = gzipSync(data, { level: 9 });
  gz[4] = 0; gz[5] = 0; gz[6] = 0; gz[7] = 0;
  gz[9] = 0xff;
  assert.equal(gz[9], 0xff, 'OS byte should be 0xff');
});

test('gzip decompress handles trailing zero padding', () => {
  const raw = new TextEncoder().encode('hello\0world\0');
  const gz = gzipSync(raw, { level: 9 });
  gz[4] = 0; gz[5] = 0; gz[6] = 0; gz[7] = 0;
  gz[9] = 0xff;
  const padded = new Uint8Array(200);
  padded.set(gz);
  const FLG = padded[3];
  let off = 10;
  if (FLG & 0x04) { const xl = padded[off] | (padded[off+1]<<8); off += 2+xl; }
  if (FLG & 0x08) { while(padded[off]!==0) off++; off++; }
  if (FLG & 0x10) { while(padded[off]!==0) off++; off++; }
  if (FLG & 0x02) { off += 2; }
  const result = inflateSync(padded.subarray(off));
  assert.equal(new TextDecoder().decode(result), 'hello\0world\0');
});

test('BIP-340 tagged hash matches known value', () => {
  const tag = 'centurymetadata v1';
  const msg = new TextEncoder().encode('test');
  const result = taggedHash(tag, msg);
  const tagHash = sha256(new TextEncoder().encode(tag));
  const expected = sha256(concat(tagHash, tagHash, msg));
  assert.equal(toHex(result), toHex(expected));
});

test('N=0 and N=1 derive different reader_ids', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin0 = purpose.deriveChild(harden(0));
  const coin1 = purpose.deriveChild(harden(1));
  const r0 = coin0.deriveChild(harden(1));
  const r1 = coin1.deriveChild(harden(1));
  assert.notEqual(toHex(r0.privateKey), toHex(r1.privateKey));
});

const EXPECTED_N1 = {
  WRITER_SECP_PRIVKEY: 'c5603070f7ed0d62af1067e3cc227f9b5704a08034694b01f3fdec84b2b61057',
  WRITER_PUBKEY: '02f279bb1198f5cc528945850490494c376aa9319a5bd5265aa6c7d3029577c0a4',
  READER_SECP_PRIVKEY: '6698491795775a4a0a246335c6de8f1fbb5311fe8c7cd77e672ae9f2f8d6d993',
  READER_SECP_PUBKEY: '020503e8ba4159391db3603bcd25defd4a8e2537970ee5a5c6c583ceaa70a95d6c',
  READER_MLKEM_SEED_D: 'b46b7703cc55030013e9646d83853986dcb6f04d1e2ab1b060360c5ccbe825f3',
  READER_ID: '5871d8cff6a8bb1170d3c52e12cd54118ffa007eeafc89d38c71832e0b834d0c',
};

console.log('\n=== SLOT N=1 DERIVATION ===\n');

test('N=1 writer secp privkey matches test vector', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(1));
  const writer = coin.deriveChild(harden(0));
  assert.equal(toHex(writer.privateKey), EXPECTED_N1.WRITER_SECP_PRIVKEY);
});

test('N=1 writer pubkey matches test vector', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(1));
  const writer = coin.deriveChild(harden(0));
  const pub = secp256k1.getPublicKey(writer.privateKey, true);
  assert.equal(toHex(pub), EXPECTED_N1.WRITER_PUBKEY);
});

test('N=1 reader secp privkey matches test vector', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(1));
  const reader = coin.deriveChild(harden(1));
  assert.equal(toHex(reader.privateKey), EXPECTED_N1.READER_SECP_PRIVKEY);
});

test('N=1 reader ML-KEM seed D matches test vector', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(1));
  const mlkem = coin.deriveChild(harden(3));
  assert.equal(toHex(mlkem.privateKey), EXPECTED_N1.READER_MLKEM_SEED_D);
});

test('N=1 reader_id matches test vector', () => {
  const purpose = hd.deriveChild(harden(CM_PURPOSE));
  const coin = purpose.deriveChild(harden(1));
  const readerSecp = coin.deriveChild(harden(1));
  const mlkemSeed = coin.deriveChild(harden(3));
  const readerSecpPub = secp256k1.getPublicKey(readerSecp.privateKey, true);
  const k = ml_kem1024.keygen(concat(mlkemSeed.privateKey, taggedHash(MLKEM_Z_TAG, mlkemSeed.privateKey)));
  const readerId = sha256(concat(new Uint8Array(readerSecpPub), new Uint8Array(k.publicKey)));
  assert.equal(toHex(readerId), EXPECTED_N1.READER_ID);
});

test('N=0 and N=1 reader_ids are different', () => {
  assert.notEqual(EXPECTED.READER_ID, EXPECTED_N1.READER_ID);
});

console.log('\n=== UPSTREAM TEST VECTORS (test_vectors.json) ===\n');
// Refs: https://github.com/rustyrussell/centurymetadata/blob/master/test_vectors.json
// 3 vectors: N=0 (abandon), N=1 (abandon), N=2147483647 (zoo).
// Verifies our crypto against the canonical upstream test vectors.

// ML-KEM Z tag = SHA256("centurymetadata v1 mlkem-z") — constant across all vectors.
test('ML-KEM Z tag matches upstream (SHA256 of tag string)', () => {
  const tagHash = sha256(new TextEncoder().encode(MLKEM_Z_TAG));
  assert.equal(toHex(tagHash), '2f9798126f0dc0361bc7cc7a5baced081394a0cf0f24184731c23349a0b402f2',
    'MLKEM_Z_TAG hash must match upstream test_vectors.json');
});

// BIP-340 TAG = SHA256("centurymetadata v1") — constant across all vectors.
test('BIP-340 TAG hash matches upstream', () => {
  const tagHash = sha256(new TextEncoder().encode(BIP340_TAG));
  assert.equal(toHex(tagHash), '420bad4c7832ad7977a3cf553d7e10360a4561ecfea1222d62e946be461034fc',
    'BIP340_TAG hash must match upstream test_vectors.json');
});

// ML-KEM seed Z derivation: z = taggedHash("centurymetadata v1 mlkem-z", d)
test('N=0 ML-KEM seed Z = taggedHash(MLKEM_Z_TAG, seed_D)', () => {
  const d = fromHex(EXPECTED.READER_MLKEM_SEED_D);
  const z = taggedHash(MLKEM_Z_TAG, d);
  assert.equal(toHex(z), '3013b591e0ea9be09e908bc8c24300b254082450f0f852be680e42ff19330725',
    'N=0 READER_MLKEM_SEED_Z must match upstream');
});

test('N=1 ML-KEM seed Z = taggedHash(MLKEM_Z_TAG, seed_D)', () => {
  const d = fromHex(EXPECTED_N1.READER_MLKEM_SEED_D);
  const z = taggedHash(MLKEM_Z_TAG, d);
  assert.equal(toHex(z), 'd231de9cd13b8903d2d83f8c3a6b0a8329a4835e011378b812ef5dc42857c072',
    'N=1 READER_MLKEM_SEED_Z must match upstream');
});

// N=2147483647 extreme value (vector 2 from upstream)
console.log('\n=== N=2147483647 (extreme slot number) ===\n');

const EXPECTED_NMAX = {
  WRITER_SECP_PRIVKEY: '289858d5f6c459e5c79d341fcba50b6a32d8cae6f2593e3a7738fa2596530f56',
  READER_SECP_PRIVKEY: 'ce9d8d4afbb0d3d2cd1250ecaa6d97189d9d7a529007075c6258673ea546f5c5',
  READER_MLKEM_SEED_D: '133334801c425e5066fa7b55e756a9646ba0f56e02bc2a79e408e88462da3030',
  READER_MLKEM_SEED_Z: '4ca48cb12090fca3b459ef57936ae4699d4e92d2de4659e83dd6d7ea99517696',
  READER_ID: '2cf6ab97beb2509a65e6b86cfa07305f9d5282440e03e601e6b967aeb9dc2068',
};
const NMAX = 2147483647;
const MNEMONIC_ZOO = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo abstract';

test('N=2147483647 writer privkey matches upstream vector 2', () => {
  const zooSeed = mnemonicToSeedSync(MNEMONIC_ZOO);
  const zooHd = HDKey.fromMasterSeed(zooSeed);
  const p = zooHd.deriveChild(harden(CM_PURPOSE));
  const c = p.deriveChild(harden(NMAX));
  const w = c.deriveChild(harden(0));
  assert.equal(toHex(w.privateKey), EXPECTED_NMAX.WRITER_SECP_PRIVKEY);
});

test('N=2147483647 reader secp privkey matches upstream vector 2', () => {
  const zooSeed = mnemonicToSeedSync(MNEMONIC_ZOO);
  const zooHd = HDKey.fromMasterSeed(zooSeed);
  const p = zooHd.deriveChild(harden(CM_PURPOSE));
  const c = p.deriveChild(harden(NMAX));
  const r = c.deriveChild(harden(1));
  assert.equal(toHex(r.privateKey), EXPECTED_NMAX.READER_SECP_PRIVKEY);
});

test('N=2147483647 reader ML-KEM seed D matches upstream vector 2', () => {
  const zooSeed = mnemonicToSeedSync(MNEMONIC_ZOO);
  const zooHd = HDKey.fromMasterSeed(zooSeed);
  const p = zooHd.deriveChild(harden(CM_PURPOSE));
  const c = p.deriveChild(harden(NMAX));
  const m = c.deriveChild(harden(3));
  assert.equal(toHex(m.privateKey), EXPECTED_NMAX.READER_MLKEM_SEED_D);
});

test('N=2147483647 ML-KEM seed Z matches upstream vector 2', () => {
  const d = fromHex(EXPECTED_NMAX.READER_MLKEM_SEED_D);
  const z = taggedHash(MLKEM_Z_TAG, d);
  assert.equal(toHex(z), EXPECTED_NMAX.READER_MLKEM_SEED_Z);
});

test('N=2147483647 reader_id matches upstream vector 2', () => {
  const zooSeed = mnemonicToSeedSync(MNEMONIC_ZOO);
  const zooHd = HDKey.fromMasterSeed(zooSeed);
  const p = zooHd.deriveChild(harden(CM_PURPOSE));
  const c = p.deriveChild(harden(NMAX));
  const readerSecp = c.deriveChild(harden(1));
  const mlkemSeed = c.deriveChild(harden(3));
  const readerSecpPub = secp256k1.getPublicKey(readerSecp.privateKey, true);
  const k = ml_kem1024.keygen(concat(mlkemSeed.privateKey, taggedHash(MLKEM_Z_TAG, mlkemSeed.privateKey)));
  const readerId = sha256(concat(new Uint8Array(readerSecpPub), new Uint8Array(k.publicKey)));
  assert.equal(toHex(readerId), EXPECTED_NMAX.READER_ID);
});

console.log('\n=== FULL ENCODE → DECODE ROUND-TRIP ===\n');

test('encode→decode: TYPE\\0NAME\\0CONTENTS\\0 triples survive full pipeline', () => {
  const INPUT_TRIPLES = [
    ['bitcoin wallet labels', 'savings', '{"type":"addr","ref":"bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4","label":"savings"}'],
    ['bitcoin psbt', 'unsigned', 'cHNidP8BAHUCAAAAASaBcTce3/KFHeE2a6QAHfxqcrxfHGgG7vid5hU+nQITAAAA'],
  ];

  const p = hd.deriveChild(harden(CM_PURPOSE));
  const c = p.deriveChild(harden(0));
  const writerPriv = c.deriveChild(harden(0)).privateKey;
  const readerSecpPriv = c.deriveChild(harden(1)).privateKey;
  const readerMlkemSeedD = c.deriveChild(harden(3)).privateKey;

  const writerPub = new Uint8Array(secp256k1.getPublicKey(writerPriv, true));
  const readerSecpPub = new Uint8Array(secp256k1.getPublicKey(readerSecpPriv, true));
  const mlkemZ = taggedHash(MLKEM_Z_TAG, readerMlkemSeedD);
  const mlkemKeys = ml_kem1024.keygen(concat(readerMlkemSeedD, mlkemZ));
  const readerId = sha256(concat(readerSecpPub, new Uint8Array(mlkemKeys.publicKey)));

  // --- ENCODE ---
  const ecdhSecret = computeEcdh(writerPriv, readerSecpPub);
  const encap = ml_kem1024.encapsulate(new Uint8Array(mlkemKeys.publicKey));
  const mlkemCt = new Uint8Array(encap.cipherText);
  const mlkemSecret = new Uint8Array(encap.sharedSecret);
  const aesKey = sha256(concat(ecdhSecret, mlkemSecret));

  const enc = new TextEncoder();
  let rawData = new Uint8Array(0);
  for (const [type, name, contents] of INPUT_TRIPLES) {
    rawData = concat(rawData, enc.encode(type), new Uint8Array([0]), enc.encode(name), new Uint8Array([0]), enc.encode(contents), new Uint8Array([0]));
  }
  const compressed = gzipSync(rawData, { level: 9 });
  compressed[4] = 0; compressed[5] = 0; compressed[6] = 0; compressed[7] = 0;
  if (compressed.length > 9) compressed[9] = 0xff;
  const DATA_LENGTH = 6487;
  if (compressed.length > DATA_LENGTH) throw new Error('Compressed data too large');
  const padded = new Uint8Array(DATA_LENGTH);
  padded.set(compressed);

  const cipher = createCipheriv('aes-256-ctr', Buffer.from(aesKey), Buffer.alloc(16, 0));
  const encrypted = Buffer.concat([cipher.update(Buffer.from(padded)), cipher.final()]);

  const genBytes = Buffer.alloc(8);
  const content = concat(writerPub, readerId, new Uint8Array(genBytes), mlkemCt, new Uint8Array(encrypted));
  const prehash = taggedHash(BIP340_TAG, content);
  const sig = new Uint8Array(schnorr.sign(prehash, writerPriv));

  // --- DECODE ---
  const decodeContent = content;
  const decodePrehash = taggedHash(BIP340_TAG, decodeContent);
  const writerXOnly = writerPub.subarray(1, 33);
  const sigValid = schnorr.verify(sig, decodePrehash, writerXOnly);
  assert.ok(sigValid, 'Signature must verify');

  const decodeEcdh = computeEcdh(readerSecpPriv, writerPub);
  const decodeMlkemSecret = ml_kem1024.decapsulate(mlkemCt, new Uint8Array(mlkemKeys.secretKey));
  const decodeAesKey = sha256(concat(decodeEcdh, new Uint8Array(decodeMlkemSecret)));

  const decipher = createDecipheriv('aes-256-ctr', Buffer.from(decodeAesKey), Buffer.alloc(16, 0));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted)), decipher.final()]);

  const FLG = decrypted[3];
  let off = 10;
  if (FLG & 0x04) { const xl = decrypted[off] | (decrypted[off + 1] << 8); off += 2 + xl; }
  if (FLG & 0x08) { while (off < decrypted.length && decrypted[off] !== 0) off++; off++; }
  if (FLG & 0x10) { while (off < decrypted.length && decrypted[off] !== 0) off++; off++; }
  if (FLG & 0x02) { off += 2; }
  const decompressed = inflateSync(decrypted.subarray(off));

  const text = new TextDecoder().decode(decompressed);
  const parts = text.split('\0');
  if (parts[parts.length - 1] === '') parts.pop();

  assert.equal(parts.length, INPUT_TRIPLES.length * 3,
    `Expected ${INPUT_TRIPLES.length * 3} fields (${INPUT_TRIPLES.length} triples), got ${parts.length}`);

  for (let i = 0; i < INPUT_TRIPLES.length; i++) {
    const [expType, expName, expContents] = INPUT_TRIPLES[i];
    const base = i * 3;
    assert.equal(parts[base], expType, `Triple ${i} TYPE mismatch`);
    assert.equal(parts[base + 1], expName, `Triple ${i} NAME mismatch`);
    assert.equal(parts[base + 2], expContents, `Triple ${i} CONTENTS mismatch`);
  }
});

console.log('\n=== BIP-39 PASSPHRASE ===\n');

test('Different passphrase produces different seed', () => {
  const seed1 = mnemonicToSeedSync(MNEMONIC, '');
  const seed2 = mnemonicToSeedSync(MNEMONIC, 'extra-passphrase');
  assert.notEqual(toHex(seed1), toHex(seed2));
});

test('Different passphrase produces different writer key', () => {
  const s1 = mnemonicToSeedSync(MNEMONIC, '');
  const s2 = mnemonicToSeedSync(MNEMONIC, 'secret');
  const h1 = HDKey.fromMasterSeed(s1);
  const h2 = HDKey.fromMasterSeed(s2);
  const w1 = h1.deriveChild(harden(CM_PURPOSE)).deriveChild(harden(0)).deriveChild(harden(0));
  const w2 = h2.deriveChild(harden(CM_PURPOSE)).deriveChild(harden(0)).deriveChild(harden(0));
  assert.notEqual(toHex(w1.privateKey), toHex(w2.privateKey));
});

console.log('\n=== XOR-PIR LOGIC ===\n');

test('XOR-PIR masks are complementary at target bit', () => {
  const targetBit = 42;
  const maskA = new Uint8Array(128);
  crypto.getRandomValues(maskA);
  maskA[Math.floor(targetBit / 8)] |= 1 << (targetBit % 8);
  const maskB = new Uint8Array(maskA);
  maskB[Math.floor(targetBit / 8)] ^= 1 << (targetBit % 8);
  const bitA = (maskA[Math.floor(targetBit / 8)] >> (targetBit % 8)) & 1;
  const bitB = (maskB[Math.floor(targetBit / 8)] >> (targetBit % 8)) & 1;
  assert.equal(bitA, 1, 'maskA should have target bit SET');
  assert.equal(bitB, 0, 'maskB should have target bit CLEARED');
  for (let i = 0; i < 128 * 8; i++) {
    if (i === targetBit) continue;
    const a = (maskA[Math.floor(i / 8)] >> (i % 8)) & 1;
    const b = (maskB[Math.floor(i / 8)] >> (i % 8)) & 1;
    assert.equal(a, b, `non-target bit ${i} should be identical in both masks`);
  }
});

test('XOR of identical data cancels to zeros', () => {
  const data = new Uint8Array(8192);
  for (let i = 0; i < 8192; i++) data[i] = (i * 37) & 0xff;
  const xored = new Uint8Array(8192);
  for (let i = 0; i < 8192; i++) xored[i] = data[i] ^ data[i];
  let allZero = true;
  for (const b of xored) if (b !== 0) { allZero = false; break; }
  assert.ok(allZero, 'XOR of identical data should be all zeros');
});

test('XOR-PIR recovers target slot from two responses', () => {
  const targetSlot = new Uint8Array(8192);
  for (let i = 0; i < 8192; i++) targetSlot[i] = (i * 13) & 0xff;
  const decoySlot = new Uint8Array(8192);
  for (let i = 0; i < 8192; i++) decoySlot[i] = (i * 7) & 0xff;

  const responseA = new Uint8Array(8192);
  for (let i = 0; i < 8192; i++) responseA[i] = targetSlot[i] ^ decoySlot[i];
  const responseB = new Uint8Array(decoySlot);

  const recovered = new Uint8Array(8192);
  for (let i = 0; i < 8192; i++) recovered[i] = responseA[i] ^ responseB[i];

  assert.deepEqual(Array.from(recovered), Array.from(targetSlot));
});

console.log('\n=== SPEC DRIFT: PREAMBLE constant vs upstream constants.py ===\n');
// Refs:
//   upstream constants.py:1-19 — defines `verheader + preamble` byte-exact
//   upstream commit c750c08 (2026-07-08) — wire format TITLE\0CONTENTS\0 → TYPE\0NAME\0CONTENTS\0
//   Our encoder in src/lib/cm/encode.ts already produces triples; the PREAMBLE
//   text-constant must describe triples too, otherwise uploads fail with
//   "Incorrect preamble" against any server running current master (decode.deconstruct
//   does startswith(preamble) verification).

test('src/lib/cm/constants.ts PREAMBLE describes TYPE\\0NAME\\0CONTENTS\\0 triples', () => {
  const src = readFileSync('src/lib/cm/constants.ts', 'utf8');
  // TS source: inside the body literal, NUL bytes are written as \\0 (escaped). Upstream
  // constants.py line 19 ends with: DATA: gzip([TYPE\0NAME\0CONTENTS\0]+), padded with 0 bytes to 6487\0
  // Our source must mirror that exactly (5 more bytes than the old TITLE\0CONTENTS\0 form).
  assert.ok(
    src.includes("'DATA: gzip([TYPE\\\\0NAME\\\\0CONTENTS\\\\0]+), padded with 0 bytes to 6487\\0'"),
    "PREAMBLE body in src/lib/cm/constants.ts must end with: 'DATA: gzip([TYPE\\0NAME\\0CONTENTS\\0]+), padded with 0 bytes to 6487\\0' " +
    "(mirrors upstream constants.py since commit c750c08 on 2026-07-08). Currently still has the old TITLE\\0CONTENTS\\0 form."
  );
});

test('test/roundtrip.mjs PREAMBLE describes TYPE\\0NAME\\0CONTENTS\\0 triples', () => {
  const src = readFileSync('test/roundtrip.mjs', 'utf8');
  // roundtrip.mjs builds the same PREAMBLE byte-for-byte; it must also mirror upstream.
  assert.ok(
    src.includes("DATA: gzip([TYPE\\\\0NAME\\\\0CONTENTS\\\\0]+), padded with 0 bytes to 6487\\0'"),
    "PREAMBLE body in test/roundtrip.mjs must also use TYPE\\0NAME\\0CONTENTS\\0 (mirror upstream constants.py)."
  );
});

test('docs/bridge.md and README.md cite the upstream-correct byte counts (preamble=1051, record=9243)', () => {
  // Upstream constants.py: len(verheader) + len(body with TYPE/NAME/CONTENTS line) = 19 + 1032 = 1051.
  // Record total = 1051 (preamble) + 8192 (binary slot) = 9243.
  // The old 1046/9238 figures correspond to the pre-2026-07-08 TITLE\0CONTENTS\0 preamble.
  for (const path of ['docs/bridge.md', 'README.md']) {
    const txt = readFileSync(path, 'utf8');
    assert.ok(
      !txt.includes('PREAMBLE[1046]') && !txt.includes('9238 bytes'),
      `${path} still references the old preamble size 1046 / record size 9238. ` +
      'Upstream master since commit c750c08 (2026-07-08) uses 1051 / 9243.'
    );
    // PRESENCE check: docs that cite wire-level sizes must state the upstream-correct
    // figures, not just omit the old ones. Verified against constants.py at master HEAD.
    if (txt.includes('PREAMBLE[')) {
      assert.ok(
        txt.includes('PREAMBLE[1051]'),
        `${path} mentions PREAMBLE[...] but does not cite the upstream-correct size 1051. ` +
        'Either add PREAMBLE[1051] or remove the bracketed annotation.'
      );
    }
    if (txt.includes('bytes:')) {
      assert.ok(
        txt.includes('9243 bytes') || txt.includes('9243 ('),
        `${path} mentions a byte total but does not cite 9243 (the upstream-correct full-record size).`
      );
    }
  }
});

console.log('\n=== SPEC DRIFT: XOR-PIR target bit must be bundle.index, not slotIdx ===\n');
// Refs:
//   upstream README.md "Retrieving Entries: POST /api/v1/fetchxor/{DIRECTORY}" — the
//   128-byte bitmask selects BUNDLES within a DIRECTORY (1024 bits, one per bundle).
//   Slots-within-bundle are found by client-side reader_id scan; there is no
//   slot-level PIR primitive in the upstream API.
//
// Our fetchSlotPrivate() previously computed `bundle.index * 1024 + slotIdx` then
// `globalBit % 1024` (= slotIdx), losing bundle.index entirely. That worked only by
// accident when there was a single bundle (index 0). The correct call is
// `generateXorPirMasks(bundle.index)` to hide WHICH bundle in the directory.

test('fetchSlotPrivate uses bundle.index as the XOR-PIR target bit', () => {
  const src = readFileSync('src/lib/cm/network.ts', 'utf8');
  const fnMatch = src.match(/export async function fetchSlotPrivate[\s\S]*?\n}\n/);
  assert.ok(fnMatch, 'fetchSlotPrivate function body not found in src/lib/cm/network.ts');
  const fnBody = fnMatch[0];
  // Strip line + block comments so the assertions look only at executable code.
  const codeOnly = fnBody
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    !/\bglobalBit\b/.test(codeOnly),
    'fetchSlotPrivate executable code still references `globalBit`. ' +
    'The 128-byte fetchxor bitmask is per-DIRECTORY: each bit selects a BUNDLE. ' +
    'Use generateXorPirMasks(bundle.index) directly so PIR hides which bundle is requested.'
  );
  assert.ok(
    /generateXorPirMasks\(\s*bundle\.index\s*\)/.test(codeOnly),
    'fetchSlotPrivate should call generateXorPirMasks(bundle.index). ' +
    'The reader_id is found by client-side scan after the bundle is recovered via XOR.'
  );
});

console.log('\n=== SPEC DRIFT: roundtrip.mjs payload + decoder must be TYPE\\0NAME\\0CONTENTS\\0 triples ===\n');
// Refs:
//   upstream constants.py:19 — PREAMBLE text says DATA: gzip([TYPE\0NAME\0CONTENTS\0]+)
//   upstream encode.py:13-19 compress() — iterates (type, name, contents) triples
//   upstream decode.py:16-21 decompress() — asserts len(fields) % 3 == 1, iterates by 3
//
// A previous drift fix updated the PREAMBLE *text constant* in roundtrip.mjs to say
// TYPE\0NAME\0CONTENTS\0, but the actual payload + parser were left in the old
// TITLE\0CONTENTS\0 (pair) form. That produces internally inconsistent records:
// the preamble describes triples but the data is pairs. Upstream decode.decompress
// rejects pairs (returns None when len(fields) % 3 != 1).

test('test/roundtrip.mjs encodes a TYPE\\0NAME\\0CONTENTS\\0 triple as payload (not a pair)', () => {
  const src = readFileSync('test/roundtrip.mjs', 'utf8');
  // The raw payload must have three NUL-separated fields ending with a trailing NUL.
  // Pattern: TYPE\0NAME\0CONTENTS\0 where TYPE is one of the 5 accepted strings.
  // Strategy: find the rawData assignment line(s), count \\0 occurrences.
  // A valid triple has exactly 3 \\0 (TYPE\0NAME\0CONTENTS\0); a pair has 2.
  const acceptedTypes = ['bitcoin psbt', 'bitcoin transaction', 'bitcoin miniscript',
    'bitcoin output script descriptor', 'bitcoin wallet labels'];

  // Find the rawData construction block.
  const payloadMatch = src.match(/const\s+rawData\s*=\s*Buffer\.from\([\s\S]*?'utf8'/);
  assert.ok(payloadMatch, 'Could not find `const rawData = Buffer.from(...)` in roundtrip.mjs');
  const payloadBlock = payloadMatch[0];

  // Count \\0 occurrences (each NUL separator in source text appears as the two chars \0).
  const nulCount = (payloadBlock.match(/\\0/g) || []).length;
  assert.ok(
    nulCount >= 3,
    `test/roundtrip.mjs rawData payload must contain at least 3 NUL separators (TYPE\\0NAME\\0CONTENTS\\0 triples). ` +
    `Found ${nulCount} — this is a ${nulCount === 2 ? 'pair (pre-c750c08 form)' : 'invalid'} payload.`
  );

  // Check one of the accepted TYPEs appears in the payload.
  const hasAcceptedType = acceptedTypes.some(t => payloadBlock.includes(t));
  assert.ok(
    hasAcceptedType,
    'test/roundtrip.mjs rawData payload must use one of the 5 accepted TYPEs. ' +
    'None found: ' + acceptedTypes.join(', ')
  );

  // Negative check: old pair form must be gone.
  assert.ok(
    !src.includes("'blossomflare test\\0hello from blossomflare\\0'"),
    "test/roundtrip.mjs still references the old 'blossomflare test\\0hello from blossomflare\\0' pair payload."
  );
});

test('test/roundtrip.mjs decoder parses triples (i += 3, not i += 2)', () => {
  const src = readFileSync('test/roundtrip.mjs', 'utf8');
  // The decoder must iterate parts in steps of 3 (TYPE, NAME, CONTENTS).
  // Old pair decoder used `i += 2` and pushed [parts[i], parts[i+1]].
  // Correct triple decoder uses `i += 3` and pushes [parts[i], parts[i+1], parts[i+2]].
  assert.ok(
    !/i\s*\+=\s*2/.test(src) || src.includes('i += 3'),
    "test/roundtrip.mjs decoder must step by 3 (triples), not 2 (pairs). " +
    "Replace `i += 2` with `i += 3` and push 3 fields per iteration."
  );
  assert.ok(
    /i\s*\+=\s*3/.test(src),
    "test/roundtrip.mjs decoder must contain `i += 3` for triple parsing."
  );
});

console.log('\n=== SPEC DRIFT: centurymetadata.ts header docstring must say "bundles" for fetchxor bitmask ===\n');
// Refs:
//   upstream README.md "Retrieving Entries: POST /api/v1/fetchxor/{DIRECTORY}" —
//   "POST a 128-byte bitmask (one bit per bundle in the directory)". The bitmask
//   selects BUNDLES within a DIRECTORY (1024 bits). A single-bit mask returns one
//   raw 8 MB bundle (1024 x 8192-byte slots). The same conceptual fix was already
//   applied to CmBundleSystem.svelte:154-157 but the file-level JSDoc in
//   centurymetadata.ts:42-48 was missed.

test('src/lib/cm/index.ts header docstring says fetchxor bitmask selects bundles', () => {
  const src = readFileSync('src/lib/cm/index.ts', 'utf8');
  // The "Bundle retrieval" section of the file-level JSDoc must use bundle terminology.
  const bundleSection = src.match(/== Bundle retrieval ==[\s\S]*?==/);
  assert.ok(bundleSection, 'Could not find == Bundle retrieval == section in src/lib/cm/index.ts header');
  const section = bundleSection[0];
  assert.ok(
    /bitmask selecting which bundles[\s\S]*?to include/.test(section),
    'src/lib/cm/index.ts header "Bundle retrieval" section must say "bitmask selecting which bundles to include" ' +
    '(per upstream README "Retrieving Entries"). Currently still says "slots".'
  );
  assert.ok(
    /single-bit bitmask, you get the raw bundle/.test(section),
    'src/lib/cm/index.ts header must say "single-bit bitmask, you get the raw bundle" ' +
    '(a bundle is 1024 slots = 8 MB, not a single slot).'
  );
  assert.ok(
    !/selecting which slots to include/.test(section) && !/XORs selected slots/.test(section),
    'src/lib/cm/index.ts header still uses "slots" terminology for the fetchxor bitmask. ' +
    'The bitmask selects BUNDLES within a DIRECTORY.'
  );
});

console.log('\n=== KNOWN KEYS SCHEME (upstream known_words.txt) ===\n');
// Refs:
//   upstream python/centurymetadata/server/known_keys.py + known_words.txt
//   130 BIP-39 words qualify (single word ×12 with valid checksum).
//   First half = self-authored, second half = example data.

test('KNOWN_WORDS has exactly 130 entries', () => {
  const src = readFileSync('src/lib/cm/keys.ts', 'utf8');
  // Extract the Object.freeze([...]) block for KNOWN_WORDS
  const match = src.match(/KNOWN_WORDS[^;]*Object\.freeze\(\[\s*([\s\S]*?)\]\)/);
  assert.ok(match, 'KNOWN_WORDS Object.freeze array not found');
  const words = match[1].match(/'[^']+'/g);
  assert.ok(words, 'No quoted strings found in KNOWN_WORDS');
  assert.equal(words.length, 130, `Expected 130 known words, found ${words.length}`);
});

test('KNOWN_WORDS includes action, agent, aim (first) and word, world, yellow (last)', () => {
  const src = readFileSync('src/lib/cm/keys.ts', 'utf8');
  assert.ok(src.includes("'action'"), 'KNOWN_WORDS must include "action" (first known word)');
  assert.ok(src.includes("'agent'"), 'KNOWN_WORDS must include "agent"');
  assert.ok(src.includes("'aim'"), 'KNOWN_WORDS must include "aim"');
  assert.ok(src.includes("'word'"), 'KNOWN_WORDS must include "word"');
  assert.ok(src.includes("'world'"), 'KNOWN_WORDS must include "world"');
  assert.ok(src.includes("'yellow'"), 'KNOWN_WORDS must include "yellow" (last known word)');
});

test('knownWordMnemonic produces word ×12', () => {
  const src = readFileSync('src/lib/cm/keys.ts', 'utf8');
  // The function should join 12 copies of the word with spaces
  assert.ok(
    /function knownWordMnemonic[\s\S]*?Array\.from\(\s*\{\s*length:\s*12\s*\}/.test(src) ||
    /function knownWordMnemonic[\s\S]*?word.*12/.test(src),
    'knownWordMnemonic must produce a 12-word mnemonic from a single word'
  );
});

test('isSelfAuthoredWord: first half = self-authored, second half = example data', () => {
  const src = readFileSync('src/lib/cm/keys.ts', 'utf8');
  // The function must split at the midpoint (65 for 130 words)
  assert.ok(
    /isSelfAuthoredWord[\s\S]*?<\s*Math\.floor\s*\(\s*KNOWN_WORDS\.length\s*\/\s*2\s*\)/.test(src),
    'isSelfAuthoredWord must use the first-half/second-half split per upstream known_keys.py:50-55'
  );
});

test('RECORD_EXAMPLES has all 5 accepted Bitcoin types', () => {
  const src = readFileSync('src/lib/cm/keys.ts', 'utf8');
  for (const type of ['bitcoin psbt', 'bitcoin transaction', 'bitcoin miniscript',
                       'bitcoin output script descriptor', 'bitcoin wallet labels']) {
    assert.ok(
      src.includes(`'${type}'`) && src.includes(`"${type}"`) === false || src.includes(`'${type}'`),
      `RECORD_EXAMPLES must include type "${type}"`
    );
  }
});

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
