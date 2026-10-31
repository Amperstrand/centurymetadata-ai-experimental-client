// centurymetadata full round-trip test against the public test API.
// One mnemonic -> two ecosystems: a Nostr (NIP-06) key AND centurymetadata keys.
//
//   node test/roundtrip.mjs [mnemonic]
//
// PROVENANCE: this file is the Node reference implementation that mirrors the
// upstream Python examples/centurytool.py flow, using Node's stdlib instead of
// browser libs. The PREAMBLE constant below is a byte-exact copy of
// python/centurymetadata/constants.py:1-19; the encode pipeline mirrors
// python/centurymetadata/encode.py:101-113; the decode pipeline mirrors
// python/centurymetadata/decode.py:76-92. See LICENSE for the upstream
// MIT notice and docs/SPEC-DRIFT.md for known deployment-lag issues with the
// public test API.
//
// NOTE: as of 2026-10-30, the test API at testapi.centurymetadata.org lags
// upstream master — it serves the pre-547b543 preamble (8192-byte slots, gzip +
// AES-256-CTR, 1051-byte preamble) and rejects the current 1187-byte preamble
// with HTTP 400 "Incorrect preamble". This script pins master-HEAD behaviour
// (16384-byte slots, zlib + AES-256-GCM, GEN little-endian, AESKEY binds GEN),
// so the live round-trip is expected to fail until the upstream operator
// redeploys. See docs/SPEC-DRIFT.md for details.

import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { secp256k1, schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { HDKey, HARDENED_OFFSET } from '@scure/bip32';
import { mnemonicToSeedSync, generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { deflateSync, inflateSync } from 'node:zlib';
import { createCipheriv, createDecipheriv } from 'node:crypto';

// --- Constants -------------------------------------------------------------
// Upstream provenance: python/centurymetadata/constants.py:4-17 at master 547b543 —
// byte-exact mirror. 19-byte verheader "centurymetadata v1\0" + 1168-byte body = 1187 bytes.
// Drift guard: test/unit-tests.mjs → "PREAMBLE describes ZLIB TYPE\0NAME\0CONTENTS\0 triples".
const PREAMBLE = (() => {
  const verheader = Buffer.from('centurymetadata v1\0', 'latin1');
  const body = Buffer.from(
    'SIG[64]|WRITER_PUBKEY[33]|READER_ID[32]|GEN[8]|MLKEM_CT[1568]|AES[14679]\n\n' +
      'SIG: BIP-340 SHA256(TAG|TAG|WRITER_PUBKEY|READER_ID|GEN|MLKEM_CT|AES)\n' +
      "WRITER_PUBKEY: BIP-32 0x44315441'/N'/0'\n" +
      "READER_SECP_PRIVKEY: BIP-32 0x44315441'/N'/1'\n" +
      'READER_SECP_PUBKEY: 33-byte compressed G*READER_SECP_PRIVKEY\n' +
      "READER_MLKEM_SEED_D: BIP-32 0x44315441'/N'/3'\n" +
      'READER_MLKEM_SEED_Z: BIP-340 SHA256(MLKEM_Z_TAG|MLKEM_Z_TAG|READER_MLKEM_SEED_D)\n' +
      'MLKEM_Z_TAG: SHA256("centurymetadata v1 mlkem-z"[26])\n' +
      'READER_MLKEM_PRIVKEY, READER_MLKEM_PUBKEY: ML-KEM-1024.KeyGen(d=READER_MLKEM_SEED_D,z=READER_MLKEM_SEED_Z)\n' +
      'READER_ID: SHA256(READER_SECP_PUBKEY|READER_MLKEM_PUBKEY)\n' +
      'TAG: SHA256("centurymetadata v1"[18])\n' +
      "MLKEM_CT: ML-KEM-1024 (FIPS 203) ciphertext encapsulated to reader's ML-KEM key\n" +
      'MLKEM_SECRET: ML-KEM-1024.Decaps(MLKEM_CT, READER_MLKEM_PRIVKEY)\n' +
      'ECDH_SECRET: EC Diffie-Hellman of WRITER_PUBKEY and READER_SECP_PRIVKEY = SHA256(33-byte compressed WRITER_PUBKEY*READER_SECP_PRIVKEY)\n' +
      'AESKEY: SHA256(ECDH_SECRET|MLKEM_SECRET|GEN)\n' +
      'AES: AES-256-GCM using AESKEY, 12-byte all-zero nonce, of DATA; 16-byte authentication tag appended\n' +
      'DATA: ZLIB([TYPE\\0NAME\\0CONTENTS\\0]+), padded with 0 bytes to 14663\0',
    'latin1'
  );
  return Buffer.concat([verheader, body]);
})();
const DATA_LENGTH = 16384; // post-preamble binary slot (SIG..AES inclusive)
const MLKEM_CT_LENGTH = 1568;
const PLAINTEXT_LENGTH = 14663; // padded zlib plaintext
const AES_LENGTH = 14679; // PLAINTEXT_LENGTH + 16-byte GCM tag
const BIP340_TAG = 'centurymetadata v1';
const MLKEM_Z_TAG = 'centurymetadata v1 mlkem-z';
const TEST_API = 'https://testapi.centurymetadata.org';
const AUTHTOKEN = '0'.repeat(64);
const CM_PURPOSE = 0x44315441; // "D1TA"

// --- Helpers ---------------------------------------------------------------
function taggedHash(tag, msg) {
  const tagBytes = new TextEncoder().encode(tag);
  const tagHash = sha256(tagBytes);
  return sha256(Buffer.concat([tagHash, tagHash, msg]));
}

function bytesToNumber(bytes) {
  let result = 0n;
  for (const b of bytes) result = (result << 8n) | BigInt(b);
  return result;
}

// Upstream get_ecdh_secret (encode.py:79-81 at 547b543): libsecp256k1 ECDH default
// hashfn = SHA256 of the FULL 33-byte compressed shared point (confirmed by
// upstream test_vectors.json ECDH_SECRET values).
function computeEcdh(myPrivKey, theirPubKeyCompressed) {
  const sharedPoint = secp256k1.Point.fromBytes(theirPubKeyCompressed).multiply(bytesToNumber(myPrivKey));
  return sha256(sharedPoint.toBytes(true)); // SHA256 of all 33 compressed bytes
}

function harden(index) {
  return (HARDENED_OFFSET + index) >>> 0;
}

// --- 1. Mnemonic -----------------------------------------------------------
const mnemonic = process.argv[2] || generateMnemonic(wordlist, 128); // 12 words
const seed = mnemonicToSeedSync(mnemonic);

// --- 2. Derive Nostr (NIP-06) + centurymetadata keys from the same seed -----
const hdRoot = HDKey.fromMasterSeed(seed);

// NIP-06 Nostr identity (derivation path m/44'/1237'/0'/0/0 per NIP-06 spec).
const nostrChild = hdRoot.derive("m/44'/1237'/0'/0/0");
const nostrPrivKey = Buffer.from(nostrChild.privateKey);
const nostrPubKeyCompressed = Buffer.from(secp256k1.getPublicKey(nostrPrivKey, true));
const nostrPubKeyXOnly = nostrPubKeyCompressed.subarray(1, 33);

// centurymetadata: m / CM_PURPOSE' / 0' / {0'=writer, 1'=reader-secp, 3'=reader-mlkem-d}
const purpose = hdRoot.deriveChild(harden(CM_PURPOSE));
const coin = purpose.deriveChild(harden(0));
const writerChild = coin.deriveChild(harden(0));
const readerSecpChild = coin.deriveChild(harden(1));
const readerMlkemChild = coin.deriveChild(harden(3));

const writerPrivKey = Buffer.from(writerChild.privateKey); // 32
const readerSecpPrivKey = Buffer.from(readerSecpChild.privateKey); // 32
const readerMlkemSeedD = Buffer.from(readerMlkemChild.privateKey); // 32

// --- 3. ML-KEM-1024 keypair (seed = d || z) --------------------------------
const d = readerMlkemSeedD;
const z = taggedHash(MLKEM_Z_TAG, d);
const mlkemSeed = Buffer.concat([d, z]); // 64 bytes
const mlkemKeys = ml_kem1024.keygen(mlkemSeed);
const mlkemPublicKey = Buffer.from(mlkemKeys.publicKey); // 1568
const mlkemSecretKey = Buffer.from(mlkemKeys.secretKey); // 3168

// --- 4. Public keys + reader_id --------------------------------------------
const writerPubKey = Buffer.from(secp256k1.getPublicKey(writerPrivKey, true)); // 33
const readerSecpPubKey = Buffer.from(secp256k1.getPublicKey(readerSecpPrivKey, true)); // 33
const readerId = Buffer.from(sha256(Buffer.concat([readerSecpPubKey, mlkemPublicKey]))); // 32

// --- 5. ECDH (writer_priv * reader_secp_pub) -------------------------------
const ecdhSecret = Buffer.from(computeEcdh(writerPrivKey, readerSecpPubKey)); // 32

// --- 6. ML-KEM encapsulate -------------------------------------------------
const encap = ml_kem1024.encapsulate(mlkemPublicKey);
const mlkemCt = Buffer.from(encap.cipherText); // 1568
const mlkemSecret = Buffer.from(encap.sharedSecret); // 32

// --- 7. AES key + encrypt the data -----------------------------------------
// AESKEY = SHA256(ECDH_SECRET | MLKEM_SECRET | GEN) with GEN little-endian (547b543).
const generation = 0;
const genBytes = Buffer.alloc(8);
genBytes.writeBigInt64LE(BigInt(generation));
const aesKey = Buffer.from(sha256(Buffer.concat([ecdhSecret, mlkemSecret, genBytes]))); // 32

// Data payload: TYPE\0NAME\0CONTENTS\0 triples (per upstream constants.py:19 + encode.py:13-19).
// Uses 'bitcoin wallet labels' (one of the 5 accepted TYPEs per upstream validate.py:24-30)
// with a valid BIP-329 JSONL body so the record would pass TEST_MODE content validation.
// zlib (RFC 1950, level 9 — NOT gzip anymore), pad to PLAINTEXT_LENGTH.
const LABELS_REF = 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16'; // Bitcoin genesis coinbase txid
const rawData = Buffer.from(
  `bitcoin wallet labels\0roundtrip test\0{"type":"tx","ref":"${LABELS_REF}","label":"hello from centurymetadata-ai-experimental-client"}\0`,
  'utf8',
);
const compressed = deflateSync(rawData, { level: 9 });
const padded = Buffer.alloc(PLAINTEXT_LENGTH, 0);
compressed.copy(padded);

// AES-256-GCM, 12-byte all-zero nonce, 16-byte auth tag appended (upstream
// encode.py:34-45 aes()).
const iv = Buffer.alloc(12, 0);
const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
const encrypted = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]); // 14679

// --- 8. Build content, sign, assemble record -------------------------------
const content = Buffer.concat([
  writerPubKey, // 33
  readerId, // 32
  genBytes, // 8, little-endian
  mlkemCt, // 1568
  encrypted, // 14679
]); // = 16320

const prehash = taggedHash(BIP340_TAG, content);
const sig = Buffer.from(schnorr.sign(prehash, writerPrivKey)); // 64
const slot = Buffer.concat([sig, content]); // 16384
const preamble = PREAMBLE;
const fullRecord = Buffer.concat([preamble, slot]); // 1187 + 16384 = 17571

console.log('=== KEY DERIVATION ===');
console.log('  mnemonic:                ', mnemonic);
console.log('  Nostr (NIP-06) privkey:   ', nostrPrivKey.toString('hex'));
console.log('  Nostr x-only pubkey:      ', nostrPubKeyXOnly.toString('hex'));
console.log('  Nostr npub (hex payload): ', nostrPubKeyXOnly.toString('hex'));
console.log('  writer privkey (cm):      ', writerPrivKey.toString('hex'));
console.log('  reader secp privkey:      ', readerSecpPrivKey.toString('hex'));
console.log('  reader_id:                ', readerId.toString('hex'));
console.log('');
console.log('=== ENCODE ===');
console.log('  record bytes:             ', fullRecord.length);
console.log('  slot bytes (excl preamble):', slot.length);
console.log('  data (plaintext):         ', JSON.stringify(rawData.toString('utf8')));
console.log('');

// --- 9. Authorize writer on the test API -----------------------------------
const readerIdHex = readerId.toString('hex');
const writerPubHex = writerPubKey.toString('hex');
const authUrl = `${TEST_API}/api/v1/authorize/${readerIdHex}/${writerPubHex}/${AUTHTOKEN}`;
const authRes = await fetch(authUrl, { method: 'POST', body: '' });
const authText = await authRes.text();
console.log('=== AUTHORIZE ===');
console.log('  status:', authRes.status);
console.log('  body:  ', authText);

// --- 10. Upload the record --------------------------------------------------
const updateRes = await fetch(`${TEST_API}/api/v1/update`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-centurymetadata' },
  body: fullRecord,
});
const updateText = await updateRes.text();
console.log('=== UPDATE ===');
console.log('  status:', updateRes.status);
console.log('  body:  ', updateText);
console.log('');

// --- 11. Fetch the bundle and locate our slot ------------------------------
const SLOT_SIZE = DATA_LENGTH; // 16384
const READER_ID_OFFSET = 64 + 33; // after SIG[64] + WRITER_PUBKEY[33] = 97

const listRes = await fetch(`${TEST_API}/api/v1/listbundles`);
const bundles = await listRes.json();

let foundSlot = null;
for (const bundle of bundles) {
  const bitmask = Buffer.alloc(128, 0);
  bitmask[Math.floor(bundle.index / 8)] |= 1 << bundle.index % 8;
  const fetchRes = await fetch(`${TEST_API}/api/v1/fetchxor/${bundle.directory}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bitmask,
  });
  const bundleData = Buffer.from(await fetchRes.arrayBuffer());
  for (let i = 0; i + SLOT_SIZE <= bundleData.length; i += SLOT_SIZE) {
    const slotView = bundleData.subarray(i, i + SLOT_SIZE);
    const slotReaderId = slotView.subarray(READER_ID_OFFSET, READER_ID_OFFSET + 32);
    if (slotReaderId.equals(readerId)) {
      foundSlot = slotView;
      break;
    }
  }
  if (foundSlot) break;
}

if (!foundSlot) {
  // Retry once after a short settle delay.
  await new Promise((r) => setTimeout(r, 2000));
  for (const bundle of bundles) {
    const bitmask = Buffer.alloc(128, 0);
    bitmask[Math.floor(bundle.index / 8)] |= 1 << bundle.index % 8;
    const fetchRes = await fetch(`${TEST_API}/api/v1/fetchxor/${bundle.directory}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bitmask,
    });
    const bundleData = Buffer.from(await fetchRes.arrayBuffer());
    for (let i = 0; i + SLOT_SIZE <= bundleData.length; i += SLOT_SIZE) {
      const slotView = bundleData.subarray(i, i + SLOT_SIZE);
      const slotReaderId = slotView.subarray(READER_ID_OFFSET, READER_ID_OFFSET + 32);
      if (slotReaderId.equals(readerId)) {
        foundSlot = slotView;
        break;
      }
    }
    if (foundSlot) break;
  }
}

// --- 12-13. Decode + verify ------------------------------------------------
console.log('=== DECODE ===');
if (!foundSlot) {
  console.error('  FAILED: record not found in any bundle');
  process.exit(1);
}

const slotSig = foundSlot.subarray(0, 64);
const slotWriterPub = foundSlot.subarray(64, 97);
const slotReaderId = foundSlot.subarray(97, 129);
const slotGen = foundSlot.subarray(129, 137);
const slotMlkemCt = foundSlot.subarray(137, 137 + MLKEM_CT_LENGTH);
const slotEncrypted = foundSlot.subarray(137 + MLKEM_CT_LENGTH);

console.log('  found slot, reader_id matches:', slotReaderId.equals(readerId));

// Verify the writer's BIP-340 signature over the content (everything after SIG).
const decodeContent = foundSlot.subarray(64); // WRITER_PUBKEY..end = 8128
const decodePrehash = taggedHash(BIP340_TAG, decodeContent);
const writerXOnly = slotWriterPub.subarray(1, 33); // compressed -> x-only
const sigValid = schnorr.verify(slotSig, decodePrehash, writerXOnly);
console.log('  signature valid:            ', sigValid);

// Decrypt: ECDH (reader_priv * writer_pub) || ML-KEM decapsulate || GEN -> AES key.
const decodeEcdhSecret = Buffer.from(computeEcdh(readerSecpPrivKey, slotWriterPub));
const decodeMlkemSecret = Buffer.from(ml_kem1024.decapsulate(slotMlkemCt, mlkemSecretKey));
const decodeGenBytes = slotGen; // 8 bytes, little-endian on the wire
const decodeAesKey = Buffer.from(sha256(Buffer.concat([decodeEcdhSecret, decodeMlkemSecret, decodeGenBytes])));

// AES-256-GCM decrypt with tag verification (upstream decode.py:120-137 unaes()).
const decipher = createDecipheriv('aes-256-gcm', decodeAesKey, Buffer.alloc(12, 0));
decipher.setAuthTag(slotEncrypted.subarray(slotEncrypted.length - 16));
const decryptedPadded = Buffer.concat([
  decipher.update(slotEncrypted.subarray(0, slotEncrypted.length - 16)),
  decipher.final(),
]);
// zlib stream followed by zero padding; inflateSync stops at the end-of-stream
// marker and ignores the trailing bytes (upstream decompress ignores padding).
const decompressed = inflateSync(decryptedPadded);

// Parse TYPE\0NAME\0CONTENTS\0 triples (drop trailing empty from final \0).
// Per upstream decode.py tuple loop at 547b543: split by NUL, then iterate in steps of 3.
const parts = decompressed.toString('utf8').split('\0').filter((_, idx, arr) => !(idx === arr.length - 1 && arr[idx] === ''));
const fields = [];
for (let i = 0; i + 2 < parts.length; i += 3) fields.push([parts[i], parts[i + 1], parts[i + 2]]);

console.log('  generation:                 ', Number(slotGen.readBigInt64LE()));
console.log('  decoded triples:');
for (const [t, n, c] of fields) console.log(`    type=${t}  name=${n}  contents=${c.slice(0, 60)}${c.length > 60 ? '…' : ''}`);

// --- 14. Summary -----------------------------------------------------------
const roundTripOk =
  sigValid &&
  slotReaderId.equals(readerId) &&
  fields.length === 1 &&
  fields[0][0] === 'bitcoin wallet labels' &&
  fields[0][1] === 'roundtrip test' &&
  fields[0][2].includes(LABELS_REF);

console.log('');
console.log('=== BRIDGE SUMMARY (one mnemonic, two ecosystems) ===');
console.log('  Nostr identity (NIP-06):');
console.log(`    npub hex = ${nostrPubKeyXOnly.toString('hex')}`);
console.log('  centurymetadata identity:');
console.log(`    reader_id = ${readerId.toString('hex')}`);
console.log(`    writer pubkey = ${writerPubHex}`);
console.log('');
console.log(roundTripOk ? 'SUCCESS: centurymetadata round-trip verified.' : 'FAILURE: round-trip mismatch.');
process.exit(roundTripOk ? 0 : 1);
