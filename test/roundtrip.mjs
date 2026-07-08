// centurymetadata full round-trip test against the public test API.
// One mnemonic -> two ecosystems: a Nostr (NIP-06) key AND centurymetadata keys.
//
//   node tests/centurymetadata-roundtrip.mjs [mnemonic]
//
import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { secp256k1, schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { HDKey, HARDENED_OFFSET } from '@scure/bip32';
import { mnemonicToSeedSync, generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createCipheriv, createDecipheriv } from 'node:crypto';

// --- Constants -------------------------------------------------------------
// Canonical preamble (byte-exact mirror of centurymetadata's constants.py).
// verheader = "centurymetadata v1" + NUL; body ends with a NUL after "6487".
const PREAMBLE = (() => {
  const verheader = Buffer.from('centurymetadata v1\0', 'latin1');
  const body = Buffer.from(
    'SIG[64]|WRITER_PUBKEY[33]|READER_ID[32]|GEN[8]|MLKEM_CT[1568]|AES[6487]\n\n' +
      'SIG: BIP-340 SHA256(TAG|TAG|WRITER_PUBKEY|READER_ID|GEN|MLKEM_CT|AES)\n' +
      "WRITER_PUBKEY: BIP-32 0x44315441'/N'/0'\n" +
      "READER_SECP_PRIVKEY: BIP-32 0x44315441'/N'/1'\n" +
      'READER_SECP_PUBKEY: G*READER_SECP_PRIVKEY\n' +
      "READER_MLKEM_SEED_D: BIP-32 0x44315441'/N'/3'\n" +
      'READER_MLKEM_SEED_Z: BIP-340 SHA256(MLKEM_Z_TAG|MLKEM_Z_TAG|READER_MLKEM_SEED_D)\n' +
      'MLKEM_Z_TAG: SHA256("centurymetadata v1 mlkem-z"[26])\n' +
      'READER_MLKEM_PRIVKEY, READER_MLKEM_PUBKEY: ML-KEM.KeyGen(d=READER_MLKEM_SEED_D,z=READER_MLKEM_SEED_Z)\n' +
      'READER_ID: SHA256(READER_SECP_PUBKEY|READER_MLKEM_PUBKEY)\n' +
      'TAG: SHA256("centurymetadata v1"[18])\n' +
      "MLKEM_CT: ML-KEM-1024 (FIPS 203) ciphertext encapsulated to reader's ML-KEM key\n" +
      'MLKEM_SECRET: ML-KEM-1024.Decaps(MLKEM_CT, READER_MLKEM_PRIVKEY)\n' +
      'ECDH_SECRET: EC Diffie-Hellman of WRITER_PUBKEY and READER_SECP_PRIVKEY\n' +
      'AESKEY: SHA256(ECDH_SECRET|MLKEM_SECRET)\n' +
      'AES: CTR mode (starting 0, nonce 0) using AESKEY of DATA\n' +
      'DATA: gzip([TITLE\\0CONTENTS\\0]+), padded with 0 bytes to 6487\0',
    'latin1'
  );
  return Buffer.concat([verheader, body]);
})();
const FULL_LENGTH = 8192;
const MLKEM_CT_LENGTH = 1568;
const DATA_LENGTH = FULL_LENGTH - (64 + 33 + 32 + 8 + MLKEM_CT_LENGTH); // 6487
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

// libsecp256k1 ECDH default hashfn = SHA256(x_coordinate of shared point).
function computeEcdh(myPrivKey, theirPubKeyCompressed) {
  const sharedPoint = secp256k1.Point.fromBytes(theirPubKeyCompressed).multiply(bytesToNumber(myPrivKey));
  const x = sharedPoint.toBytes(true).subarray(1, 33); // compressed: [prefix, x(32)]
  return sha256(x);
}

function harden(index) {
  return (HARDENED_OFFSET + index) >>> 0;
}

// --- 1. Mnemonic -----------------------------------------------------------
const mnemonic = process.argv[2] || generateMnemonic(wordlist, 128); // 12 words
const seed = mnemonicToSeedSync(mnemonic);

// --- 2. Derive Nostr (NIP-06) + centurymetadata keys from the same seed -----
const hdRoot = HDKey.fromMasterSeed(seed);

// NIP-06 Nostr identity (same path BlossomFlare's frontend uses).
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
const aesKey = Buffer.from(sha256(Buffer.concat([ecdhSecret, mlkemSecret]))); // 32

// Data payload: title\0content\0 pairs, gzip, zero mtime (match Python mtime=0), pad to DATA_LENGTH.
const rawData = Buffer.from('blossomflare test\0hello from blossomflare\0', 'utf8');
const compressed = gzipSync(rawData, { level: 9 });
compressed[4] = 0; compressed[5] = 0; compressed[6] = 0; compressed[7] = 0; // gzip mtime field
const padded = Buffer.alloc(DATA_LENGTH, 0);
compressed.copy(padded);

const iv = Buffer.alloc(16, 0); // AES-256-CTR nonce=0, counter=0
const cipher = createCipheriv('aes-256-ctr', aesKey, iv);
const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]); // 6487

// --- 8. Build content, sign, assemble record -------------------------------
const generation = 0;
const genBytes = Buffer.alloc(8);
genBytes.writeBigInt64BE(BigInt(generation)); // 8

const content = Buffer.concat([
  writerPubKey, // 33
  readerId, // 32
  genBytes, // 8
  mlkemCt, // 1568
  encrypted, // 6487
]); // = 8128

const prehash = taggedHash(BIP340_TAG, content);
const sig = Buffer.from(schnorr.sign(prehash, writerPrivKey)); // 64
const slot = Buffer.concat([sig, content]); // 8192
const preamble = PREAMBLE;
const fullRecord = Buffer.concat([preamble, slot]); // 1046 + 8192 = 9238

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
const SLOT_SIZE = 8192;
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

// Decrypt: ECDH (reader_priv * writer_pub) || ML-KEM decapsulate -> AES key.
const decodeEcdhSecret = Buffer.from(computeEcdh(readerSecpPrivKey, slotWriterPub));
const decodeMlkemSecret = Buffer.from(ml_kem1024.decapsulate(slotMlkemCt, mlkemSecretKey));
const decodeAesKey = Buffer.from(sha256(Buffer.concat([decodeEcdhSecret, decodeMlkemSecret])));

const decipher = createDecipheriv('aes-256-ctr', decodeAesKey, Buffer.alloc(16, 0));
const decryptedPadded = Buffer.concat([decipher.update(slotEncrypted), decipher.final()]);
const decompressed = gunzipSync(decryptedPadded);

// Parse title\0content\0 pairs (drop trailing empty from final \0).
const parts = decompressed.toString('utf8').split('\0').filter((_, idx, arr) => !(idx === arr.length - 1 && arr[idx] === ''));
const fields = [];
for (let i = 0; i + 1 < parts.length; i += 2) fields.push([parts[i], parts[i + 1]]);

console.log('  generation:                 ', Number(slotGen.readBigInt64BE()));
console.log('  decoded fields:');
for (const [k, v] of fields) console.log(`    ${k}: ${v}`);

// --- 14. Summary -----------------------------------------------------------
const roundTripOk =
  sigValid &&
  slotReaderId.equals(readerId) &&
  fields.length === 1 &&
  fields[0][0] === 'blossomflare test' &&
  fields[0][1] === 'hello from blossomflare';

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
