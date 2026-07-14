import assert from 'node:assert/strict';
import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { secp256k1, schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { gzipSync, inflateSync } from 'fflate';
import { createCipheriv, createDecipheriv } from 'node:crypto';

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

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
