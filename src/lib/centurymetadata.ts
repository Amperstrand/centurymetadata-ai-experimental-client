/**
 * centurymetadata browser-compatible encode/decode.
 *
 * Ports the Node round-trip test (tests/centurymetadata-roundtrip.mjs) to use
 * Web Crypto API (AES-CTR), fflate (gzip/inflate), and @noble libs.
 *
 * EXPERIMENTAL / PROOF-OF-CONCEPT — not for production use.
 *
 * == What is centurymetadata? ==
 *
 * centurymetadata (https://centurymetadata.org) is a post-quantum key-value store
 * by Rusty Russell. Records are encrypted with hybrid cryptography (classical ECDH
 * + post-quantum ML-KEM-1024) and stored in XOR-masked "bundles" on a central
 * server. Only the holder of the correct private keys can find and decrypt their
 * own records — other users' records are visible as opaque bytes.
 *
 * == Key derivation (shared BIP-39 mnemonic) ==
 *
 *   BIP-39 Seed
 *   ├── m/44'/1237'/0'/0/0      → Nostr identity (NIP-06)
 *   │
 *   └── m/0x44315441'/0'        → centurymetadata ("D1TA" purpose)
 *       ├── /0' → Writer keypair (BIP-340 Schnorr signing)
 *       ├── /1' → Reader secp256k1 keypair (ECDH)
 *       ├── /2' → Writer ML-KEM-1024 seed (post-quantum, for bidirectional use)
 *       └── /3' → Reader ML-KEM-1024 seed (post-quantum, FIPS 203)
 *
 * 0x44315441 = ASCII "D1TA". ML-KEM seed = d || taggedHash("...mlkem-z", d) (64 bytes).
 * reader_id = SHA256(reader_secp_pubkey || reader_mlkem_pubkey).
 *
 * == Record format (9238 bytes) ==
 *
 *   PREAMBLE[1046] | SIG[64] | WRITER_PUBKEY[33] | READER_ID[32]
 *                 | GEN[8]  | MLKEM_CT[1568]     | AES[6487]
 *
 * - PREAMBLE: human-readable format description (uploaded, not stored in bundle).
 * - SIG: BIP-340 Schnorr signature over taggedHash(TAG, content[64:]).
 * - AES payload: AES-256-CTR(gzip(TYPE\0NAME\0CONTENTS\0 triples), zero-padded to 6487).
 * - AES key: SHA256(ECDH_secret || ML-KEM_secret).
 * - MLKEM_CT: ML-KEM-1024 ciphertext encapsulated to reader's ML-KEM pubkey.
 *
 * == Bundle retrieval ==
 *
 * Records are stored in 8192-byte "slots" within bundles. Bundles are served via
 * POST /api/v1/fetchxor/{directory} with a 128-byte bitmask selecting which slots
 * to include. The server XORs selected slots together and returns the result.
 * For a single-bit bitmask, you get the raw slot. The client scans for its
 * reader_id at offset 97 (SIG[64] + WRITER_PUBKEY[33]) in each slot.
 *
 * == Browser-specific notes ==
 *
 * - Node's `crypto.createCipheriv('aes-256-ctr', ...)` → Web Crypto `crypto.subtle`
 * - Node's `zlib.gzipSync` → fflate's `gzipSync` (zero mtime field bytes 4-7)
 * - Node's `zlib.gunzipSync` → fflate's `inflateSync` after manual gzip header
 *   parsing (gunzipSync returns empty on padded data; inflateSync stops at the
 *   DEFLATE end-of-stream marker and ignores trailing zero padding)
 * - API calls go through the Worker proxy at /cm/* (test API has no CORS headers)
 *
 * @see https://centurymetadata.org
 * @see https://testapi.centurymetadata.org
 * @see tests/centurymetadata-roundtrip.mjs (Node reference implementation)
 */

import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { secp256k1, schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { gzipSync, inflateSync } from 'fflate';

const FULL_LENGTH = 8192;
const MLKEM_CT_LENGTH = 1568;
const DATA_LENGTH = FULL_LENGTH - (64 + 33 + 32 + 8 + MLKEM_CT_LENGTH);
const BIP340_TAG = 'centurymetadata v1';
const MLKEM_Z_TAG = 'centurymetadata v1 mlkem-z';
const CM_PURPOSE = 0x44315441;
const AUTHTOKEN = '0'.repeat(64);
const PROXY_BASE = '/cm/api/v1';
const SLOT_SIZE = 8192;
const READER_ID_OFFSET = 64 + 33;

export const ACCEPTED_TYPES = [
  'bitcoin psbt',
  'bitcoin transaction',
  'bitcoin miniscript',
  'bitcoin output script descriptor',
  'bitcoin wallet labels',
] as const;

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

function taggedHash(tag: string, msg: Uint8Array): Uint8Array {
  const tagBytes = new TextEncoder().encode(tag);
  const tagHash = sha256(tagBytes);
  return sha256(concatBytes(tagHash, tagHash, msg));
}

function bytesToNumberBE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) result = (result << 8n) | BigInt(b);
  return result;
}

function int64ToBytesBE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = value;
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

function computeEcdh(myPrivKey: Uint8Array, theirPubKeyCompressed: Uint8Array): Uint8Array {
  const sharedPoint = secp256k1.Point.fromBytes(theirPubKeyCompressed).multiply(bytesToNumberBE(myPrivKey));
  const x = sharedPoint.toBytes(true).subarray(1, 33);
  return sha256(x);
}

function gzipCompress(data: Uint8Array): Uint8Array {
  const result = gzipSync(data, { level: 9 });
  result[4] = 0; result[5] = 0; result[6] = 0; result[7] = 0;
  if (result.length > 9) result[9] = 0xff;
  return result;
}

function gzipDecompress(data: Uint8Array): Uint8Array {
  const FLG = data[3];
  let offset = 10;
  if (FLG & 0x04) { const xlen = data[offset] | (data[offset + 1] << 8); offset += 2 + xlen; }
  if (FLG & 0x08) { while (data[offset] !== 0) offset++; offset++; }
  if (FLG & 0x10) { while (data[offset] !== 0) offset++; offset++; }
  if (FLG & 0x02) { offset += 2; }
  return inflateSync(data.subarray(offset));
}

async function aesCtrEncrypt(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CTR' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CTR', counter: new Uint8Array(16), length: 128 },
    cryptoKey,
    data,
  );
  return new Uint8Array(encrypted);
}

async function aesCtrDecrypt(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CTR' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: new Uint8Array(16), length: 128 },
    cryptoKey,
    data,
  );
  return new Uint8Array(decrypted);
}

export const PREAMBLE = (() => {
  const verheader = new TextEncoder().encode('centurymetadata v1\0');
  const bodyStr =
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
    'DATA: gzip([TITLE\\0CONTENTS\\0]+), padded with 0 bytes to 6487\0';
  const body = new TextEncoder().encode(bodyStr);
  return concatBytes(verheader, body);
})();

export interface CmKeys {
  writerPrivKey: Uint8Array;
  readerSecpPrivKey: Uint8Array;
  readerMlkemSeedD: Uint8Array;
  mlkemPublicKey: Uint8Array;
  mlkemSecretKey: Uint8Array;
  writerPubKey: Uint8Array;
  readerSecpPubKey: Uint8Array;
  readerId: Uint8Array;
  writerMlkemSeedD: Uint8Array;
  writerMlkemPublicKey: Uint8Array;
  writerMlkemSecretKey: Uint8Array;
}

export function deriveCmKeys(mnemonic: string, n: number = 0, passphrase: string = ''): CmKeys {
  const seed = mnemonicToSeedSync(mnemonic, passphrase);
  const hdRoot = HDKey.fromMasterSeed(seed);

  const purpose = hdRoot.deriveChild((0x80000000 + CM_PURPOSE) >>> 0);
  const coin = purpose.deriveChild((0x80000000 + n) >>> 0);
  const writerChild = coin.deriveChild((0x80000000 + 0) >>> 0);
  const readerSecpChild = coin.deriveChild((0x80000000 + 1) >>> 0);
  const writerMlkemChild = coin.deriveChild((0x80000000 + 2) >>> 0);
  const readerMlkemChild = coin.deriveChild((0x80000000 + 3) >>> 0);

  const writerPrivKey = new Uint8Array(writerChild.privateKey!);
  const readerSecpPrivKey = new Uint8Array(readerSecpChild.privateKey!);
  const readerMlkemSeedD = new Uint8Array(readerMlkemChild.privateKey!);
  const writerMlkemSeedD = new Uint8Array(writerMlkemChild.privateKey!);

  const d = readerMlkemSeedD;
  const z = taggedHash(MLKEM_Z_TAG, d);
  const mlkemSeed = concatBytes(d, z);
  const mlkemKeys = ml_kem1024.keygen(mlkemSeed);
  const mlkemPublicKey = new Uint8Array(mlkemKeys.publicKey);
  const mlkemSecretKey = new Uint8Array(mlkemKeys.secretKey);

  const wd = writerMlkemSeedD;
  const wz = taggedHash(MLKEM_Z_TAG, wd);
  const writerMlkemSeed = concatBytes(wd, wz);
  const writerMlkemKeys = ml_kem1024.keygen(writerMlkemSeed);
  const writerMlkemPublicKey = new Uint8Array(writerMlkemKeys.publicKey);
  const writerMlkemSecretKey = new Uint8Array(writerMlkemKeys.secretKey);

  const writerPubKey = new Uint8Array(secp256k1.getPublicKey(writerPrivKey, true));
  const readerSecpPubKey = new Uint8Array(secp256k1.getPublicKey(readerSecpPrivKey, true));
  const readerId = sha256(concatBytes(readerSecpPubKey, mlkemPublicKey));

  return {
    writerPrivKey, readerSecpPrivKey, readerMlkemSeedD,
    mlkemPublicKey, mlkemSecretKey, writerPubKey, readerSecpPubKey, readerId,
    writerMlkemSeedD, writerMlkemPublicKey, writerMlkemSecretKey,
  };
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface EncodeDebug {
  ecdhSecret: string;
  mlkemSecret: string;
  mlkemCtLen: number;
  aesKey: string;
  rawLen: number;
  compressedLen: number;
  encryptedLen: number;
  sigHex: string;
}

export interface EncodedRecord {
  fullRecord: Uint8Array;
  slot: Uint8Array;
  debug: EncodeDebug;
}

export async function encodeRecord(
  keys: CmKeys,
  triples: Array<[string, string, string]>,
  generation: bigint = 0n,
): Promise<EncodedRecord> {
  const ecdhSecret = computeEcdh(keys.writerPrivKey, keys.readerSecpPubKey);

  const encap = ml_kem1024.encapsulate(keys.mlkemPublicKey);
  const mlkemCt = new Uint8Array(encap.cipherText);
  const mlkemSecret = new Uint8Array(encap.sharedSecret);

  const aesKey = sha256(concatBytes(ecdhSecret, mlkemSecret));

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [type, name, contents] of triples) {
    parts.push(encoder.encode(type), new Uint8Array([0]),
               encoder.encode(name), new Uint8Array([0]),
               encoder.encode(contents), new Uint8Array([0]));
  }
  const rawData = concatBytes(...parts);
  const compressed = gzipCompress(rawData);
  const padded = new Uint8Array(DATA_LENGTH);
  padded.set(compressed);

  const encrypted = await aesCtrEncrypt(aesKey, padded);

  const genBytes = int64ToBytesBE(generation);

  const contentBytes = concatBytes(
    keys.writerPubKey,
    keys.readerId,
    genBytes,
    mlkemCt,
    encrypted,
  );

  const prehash = taggedHash(BIP340_TAG, contentBytes);
  const sig = schnorr.sign(prehash, keys.writerPrivKey);
  const slot = concatBytes(sig, contentBytes);
  const fullRecord = concatBytes(PREAMBLE, slot);

  return {
    fullRecord,
    slot,
    debug: {
      ecdhSecret: toHex(ecdhSecret),
      mlkemSecret: toHex(mlkemSecret),
      mlkemCtLen: mlkemCt.length,
      aesKey: toHex(aesKey),
      rawLen: rawData.length,
      compressedLen: compressed.length,
      encryptedLen: encrypted.length,
      sigHex: toHex(sig),
    },
  };
}

export interface DecodedSlot {
  sigValid: boolean;
  generation: number;
  triples: [string, string, string][];
  debug: {
    ecdhPrefix: string;
    aesKeyPrefix: string;
    encryptedLen: number;
    decryptedLen: number;
    decryptedGzipMagic: string;
    decompressedLen: number;
    decompressedHex: string;
    parsedText: string;
  };
}

export async function decodeSlot(
  keys: CmKeys,
  slot: Uint8Array,
): Promise<DecodedSlot> {
  const slotSig = slot.subarray(0, 64);
  const slotWriterPub = slot.subarray(64, 97);
  const slotGen = slot.subarray(129, 137);
  const slotMlkemCt = slot.subarray(137, 137 + MLKEM_CT_LENGTH);
  const slotEncrypted = slot.subarray(137 + MLKEM_CT_LENGTH);

  const decodeContent = slot.subarray(64);
  const decodePrehash = taggedHash(BIP340_TAG, decodeContent);
  const writerXOnly = slotWriterPub.subarray(1, 33);
  const sigValid = schnorr.verify(slotSig, decodePrehash, writerXOnly);

  const decodeEcdhSecret = computeEcdh(keys.readerSecpPrivKey, slotWriterPub);
  const decodeMlkemSecret = ml_kem1024.decapsulate(slotMlkemCt, keys.mlkemSecretKey);
  const decodeAesKey = sha256(concatBytes(decodeEcdhSecret, new Uint8Array(decodeMlkemSecret)));

  const decryptedPadded = await aesCtrDecrypt(decodeAesKey, slotEncrypted);
  const decompressed = gzipDecompress(decryptedPadded);

  const text = new TextDecoder().decode(decompressed);
  const parts = text.split('\0');
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();

  const decodedTriples: [string, string, string][] = [];
  if (parts.length % 3 === 0) {
    for (let i = 0; i < parts.length; i += 3) {
      decodedTriples.push([parts[i], parts[i + 1], parts[i + 2]]);
    }
  } else if (parts.length % 2 === 0) {
    for (let i = 0; i < parts.length; i += 2) {
      decodedTriples.push(['(legacy)', parts[i], parts[i + 1]]);
    }
  }

  const generation =
    (BigInt(slotGen[0]) << 56n) | (BigInt(slotGen[1]) << 48n) |
    (BigInt(slotGen[2]) << 40n) | (BigInt(slotGen[3]) << 32n) |
    (BigInt(slotGen[4]) << 24n) | (BigInt(slotGen[5]) << 16n) |
    (BigInt(slotGen[6]) << 8n) | BigInt(slotGen[7]);

  return {
    sigValid, generation: Number(generation), triples: decodedTriples,
    debug: {
      ecdhPrefix: toHex(decodeEcdhSecret.subarray(0, 8)),
      aesKeyPrefix: toHex(decodeAesKey.subarray(0, 8)),
      encryptedLen: slotEncrypted.length,
      decryptedLen: decryptedPadded.length,
      decryptedGzipMagic: toHex(decryptedPadded.subarray(0, 4)),
      decompressedLen: decompressed.length,
      decompressedHex: toHex(decompressed.subarray(0, 50)),
      parsedText: text.slice(0, 100),
    },
  };
}

export async function authorizeWriter(
  readerId: Uint8Array,
  writerPubKey: Uint8Array,
): Promise<{ ok: boolean; status: number; text: string }> {
  const readerIdHex = toHex(readerId);
  const writerPubHex = toHex(writerPubKey);
  const res = await fetch(`${PROXY_BASE}/authorize/${readerIdHex}/${writerPubHex}/${AUTHTOKEN}`, {
    method: 'POST',
    body: '',
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function uploadRecord(
  fullRecord: Uint8Array,
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(`${PROXY_BASE}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-centurymetadata' },
    body: fullRecord,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function fetchSlots(readerId: Uint8Array): Promise<Uint8Array[]> {
  const listRes = await fetch(`${PROXY_BASE}/listbundles`);
  const bundles = await listRes.json() as { directory: string; index: number }[];

  const foundSlots: Uint8Array[] = [];

  for (const bundle of bundles) {
    const bitmask = new Uint8Array(128);
    bitmask[Math.floor(bundle.index / 8)] |= 1 << (bundle.index % 8);
    const fetchRes = await fetch(`${PROXY_BASE}/fetchxor/${bundle.directory}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bitmask,
    });
    const bundleData = new Uint8Array(await fetchRes.arrayBuffer());
    for (let i = 0; i + SLOT_SIZE <= bundleData.length; i += SLOT_SIZE) {
      const slotView = bundleData.subarray(i, i + SLOT_SIZE);
      const slotReaderId = slotView.subarray(READER_ID_OFFSET, READER_ID_OFFSET + 32);
      let match = true;
      for (let j = 0; j < 32; j++) {
        if (slotReaderId[j] !== readerId[j]) { match = false; break; }
      }
      if (match) foundSlots.push(slotView);
    }
  }

  return foundSlots;
}

export function generateXorPirMasks(targetBit: number): { maskA: Uint8Array; maskB: Uint8Array } {
  const maskA = crypto.getRandomValues(new Uint8Array(128));
  maskA[Math.floor(targetBit / 8)] |= 1 << (targetBit % 8);
  const maskB = new Uint8Array(maskA);
  maskB[Math.floor(targetBit / 8)] ^= 1 << (targetBit % 8);
  return { maskA, maskB };
}

export function xorBundles(a: Uint8Array, b: Uint8Array): Uint8Array {
  const len = Math.min(a.length, b.length);
  const result = new Uint8Array(len);
  for (let i = 0; i < len; i++) result[i] = a[i] ^ b[i];
  return result;
}

export async function fetchSlotPrivate(
  serverBaseA: string,
  serverBaseB: string,
  readerId: Uint8Array,
): Promise<Uint8Array | null> {
  const listRes = await fetch(`${serverBaseA}/listbundles`);
  const bundles = await listRes.json() as { directory: string; index: number }[];

  for (const bundle of bundles) {
    const singleMask = new Uint8Array(128);
    singleMask[Math.floor(bundle.index / 8)] |= 1 << (bundle.index % 8);
    const probeRes = await fetch(`${serverBaseA}/fetchxor/${bundle.directory}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: singleMask,
    });
    const probeData = new Uint8Array(await probeRes.arrayBuffer());

    let slotIdx = -1;
    for (let i = 0; i + SLOT_SIZE <= probeData.length; i += SLOT_SIZE) {
      const slotRid = probeData.subarray(i + READER_ID_OFFSET, i + READER_ID_OFFSET + 32);
      let match = true;
      for (let j = 0; j < 32; j++) {
        if (slotRid[j] !== readerId[j]) { match = false; break; }
      }
      if (match) { slotIdx = i / SLOT_SIZE; break; }
    }
    if (slotIdx < 0) continue;

    if (serverBaseA === serverBaseB) return probeData.subarray(slotIdx * SLOT_SIZE, (slotIdx + 1) * SLOT_SIZE);

    const globalBit = bundle.index * 1024 + slotIdx;
    const { maskA, maskB } = generateXorPirMasks(globalBit % 1024);

    const [resA, resB] = await Promise.all([
      fetch(`${serverBaseA}/fetchxor/${bundle.directory}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: maskA,
      }),
      fetch(`${serverBaseB}/fetchxor/${bundle.directory}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: maskB,
      }),
    ]);
    const dataA = new Uint8Array(await resA.arrayBuffer());
    const dataB = new Uint8Array(await resB.arrayBuffer());
    const xored = xorBundles(dataA, dataB);
    return xored.subarray(slotIdx * SLOT_SIZE, (slotIdx + 1) * SLOT_SIZE);
  }
  return null;
}

/**
 * Find the current (highest) generation for a given writer in the fetched slots.
 * Returns 0n if no existing record is found (first write).
 * Each (READER_ID, WRITER) pair has one active slot; writing gen N+1 replaces gen N.
 */
export function getMaxGeneration(
  slots: Uint8Array[],
  writerPubKey: Uint8Array,
): bigint {
  let maxGen = 0n;
  for (const slot of slots) {
    const slotWriterPub = slot.subarray(64, 97);
    let match = true;
    for (let j = 0; j < 33; j++) {
      if (slotWriterPub[j] !== writerPubKey[j]) { match = false; break; }
    }
    if (match) {
      const slotGen = slot.subarray(129, 137);
      const gen =
        (BigInt(slotGen[0]) << 56n) | (BigInt(slotGen[1]) << 48n) |
        (BigInt(slotGen[2]) << 40n) | (BigInt(slotGen[3]) << 32n) |
        (BigInt(slotGen[4]) << 24n) | (BigInt(slotGen[5]) << 16n) |
        (BigInt(slotGen[6]) << 8n) | BigInt(slotGen[7]);
      if (gen > maxGen) maxGen = gen;
    }
  }
  return maxGen;
}

export interface SlotPublic {
  index: number;
  occupied: boolean;
  writerPubkey: string | null;
  writerXOnly: string | null;
  readerId: string | null;
  generation: number | null;
}

export interface NetworkStats {
  totalBundles: number;
  totalSlots: number;
  occupiedSlots: number;
  uniqueWriters: number;
  uniqueReaders: number;
}

export function isSlotEmpty(slot: Uint8Array): boolean {
  for (let i = 0; i < slot.length; i++) {
    if (slot[i] !== 0) return false;
  }
  return true;
}

export function parseSlotPublic(slot: Uint8Array, index: number): SlotPublic {
  if (isSlotEmpty(slot)) {
    return { index, occupied: false, writerPubkey: null, writerXOnly: null, readerId: null, generation: null };
  }
  const writerPub = slot.subarray(64, 97);
  const readerId = slot.subarray(97, 129);
  const genBytes = slot.subarray(129, 137);
  const generation = Number(
    (BigInt(genBytes[0]) << 56n) | (BigInt(genBytes[1]) << 48n) |
    (BigInt(genBytes[2]) << 40n) | (BigInt(genBytes[3]) << 32n) |
    (BigInt(genBytes[4]) << 24n) | (BigInt(genBytes[5]) << 16n) |
    (BigInt(genBytes[6]) << 8n) | BigInt(genBytes[7]),
  );
  return {
    index,
    occupied: true,
    writerPubkey: toHex(writerPub),
    writerXOnly: toHex(writerPub.subarray(1, 33)),
    readerId: toHex(readerId),
    generation,
  };
}

export async function scanNetwork(): Promise<{ slots: SlotPublic[]; stats: NetworkStats }> {
  const listRes = await fetch(`${PROXY_BASE}/listbundles`);
  const bundles = await listRes.json() as { directory: string; index: number }[];

  const allSlots: SlotPublic[] = [];
  let totalSlotCount = 0;

  for (const bundle of bundles) {
    const bitmask = new Uint8Array(128);
    bitmask[0] = 1;
    const fetchRes = await fetch(`${PROXY_BASE}/fetchxor/${bundle.directory}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bitmask,
    });
    const bundleData = new Uint8Array(await fetchRes.arrayBuffer());
    const slotCount = Math.floor(bundleData.length / SLOT_SIZE);
    totalSlotCount += slotCount;
    for (let i = 0; i < slotCount; i++) {
      allSlots.push(parseSlotPublic(bundleData.subarray(i * SLOT_SIZE, (i + 1) * SLOT_SIZE), i));
    }
  }

  const occupied = allSlots.filter(s => s.occupied);
  const writers = new Set(occupied.map(s => s.writerPubkey));
  const readers = new Set(occupied.map(s => s.readerId));

  return {
    slots: allSlots,
    stats: {
      totalBundles: bundles.length,
      totalSlots: totalSlotCount,
      occupiedSlots: occupied.length,
      uniqueWriters: writers.size,
      uniqueReaders: readers.size,
    },
  };
}

export function checkSignature(slot: Uint8Array): boolean {
  if (slot.length < FULL_LENGTH) return false;
  const sig = slot.subarray(0, 64);
  const writerPub = slot.subarray(64, 97);
  const contentBytes = slot.subarray(64);
  const prehash = taggedHash(BIP340_TAG, contentBytes);
  const writerXOnly = writerPub.subarray(1, 33);
  return schnorr.verify(sig, prehash, writerXOnly);
}

export function preambleText(): string {
  return new TextDecoder().decode(PREAMBLE);
}

export function preambleLength(): number {
  return PREAMBLE.length;
}

export function writerToColor(writerPubkeyHex: string): string {
  const r = parseInt(writerPubkeyHex.slice(2, 4), 16);
  const g = parseInt(writerPubkeyHex.slice(4, 6), 16);
  const b = parseInt(writerPubkeyHex.slice(6, 8), 16);
  return `rgb(${r}, ${g}, ${b})`;
}
