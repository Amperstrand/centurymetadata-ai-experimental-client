import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { MLKEM_CT_LENGTH, AES_LENGTH, BIP340_TAG, DATA_LENGTH } from './constants.js';
import { concatBytes, taggedHash, int64ToBytesLE, bytesToInt64LE, toHex } from './utils.js';
import { computeEcdh, zlibDecompress, aesGcmDecrypt } from './crypto.js';
import { CmKeys } from './keys.js';

export interface DecodedSlot {
  sigValid: boolean;
  aesTagValid: boolean;
  generation: number;
  triples: [string, string, string][];
  error: string | null;
  debug: {
    ecdhPrefix: string;
    aesKeyPrefix: string;
    encryptedLen: number;
    decryptedLen: number;
    decryptedZlibMagic: string;
    decompressedLen: number;
    decompressedHex: string;
    parsedText: string;
  };
}

const MAX_DECOMPRESSED = 1048576;

function splitOnNul(bytes: Uint8Array): Uint8Array[] {
  const fields: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i === bytes.length || bytes[i] === 0) {
      fields.push(bytes.subarray(start, i));
      start = i + 1;
    }
  }
  return fields;
}

function parseTriples(uncomp: Uint8Array): [string, string, string][] {
  // Upstream provenance: decode.py:62-115 decompress tuple loop (master 547b543) —
  // consume TYPE\0NAME\0CONTENTS\0 tuples in order; stop (keeping tuples already
  // parsed) when fewer than three NUL-terminated fields remain.
  const decoder = new TextDecoder();
  let fields = splitOnNul(uncomp);
  const triples: [string, string, string][] = [];
  while (!(fields.length === 1 && fields[0].length === 0)) {
    if (fields.length < 3) break;
    triples.push([
      decoder.decode(fields[0]),
      decoder.decode(fields[1]),
      decoder.decode(fields[2]),
    ]);
    fields = fields.slice(3);
  }
  return triples;
}

// Upstream provenance: decode.py:139-174 decode() + split_parts() + check_sig() (master 547b543).
// Inverse of encodeRecord: split slot → verify BIP-340 sig over taggedHash(BIP340_TAG, contentBytes)
// → ECDH(reader_secp_priv, writer_pub) → ML-KEM decapsulate → AES-256-GCM decrypt (verifies tag)
// → zlib decompress (ignores zero padding) → split TYPE\0NAME\0CONTENTS\0 triples.
// Returns sigValid=false on bad signature; aesTagValid=false (with empty triples) when the
// GCM tag does not verify (e.g. tampered payload); caller decides what to trust.
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
  // CM: SIG: BIP-340 SHA256(TAG|TAG|WRITER_PUBKEY|READER_ID|GEN|MLKEM_CT|AES)
  const sigValid = schnorr.verify(slotSig, decodePrehash, writerXOnly);

  // GEN is little-endian on the wire (SPECIFICATION.md; encode.py contents()).
  const generation = bytesToInt64LE(slotGen);

  const decodeEcdhSecret = computeEcdh(keys.readerSecpPrivKey, slotWriterPub);
  const decodeMlkemSecret = ml_kem1024.decapsulate(slotMlkemCt, keys.mlkemSecretKey);
  // CM: AESKEY: SHA256(ECDH_SECRET|MLKEM_SECRET|GEN)
  const decodeAesKey = sha256(concatBytes(decodeEcdhSecret, new Uint8Array(decodeMlkemSecret), int64ToBytesLE(generation)));

  const base: DecodedSlot = {
    sigValid,
    aesTagValid: false,
    generation: Number(generation),
    triples: [],
    error: null,
    debug: {
      ecdhPrefix: toHex(decodeEcdhSecret.subarray(0, 8)),
      aesKeyPrefix: toHex(decodeAesKey.subarray(0, 8)),
      encryptedLen: slotEncrypted.length,
      decryptedLen: 0,
      decryptedZlibMagic: '',
      decompressedLen: 0,
      decompressedHex: '',
      parsedText: '',
    },
  };

  if (slotEncrypted.length !== AES_LENGTH) {
    return { ...base, error: `AES payload must be ${AES_LENGTH} bytes, got ${slotEncrypted.length}` };
  }

  let decryptedPadded: Uint8Array;
  try {
    decryptedPadded = await aesGcmDecrypt(decodeAesKey, slotEncrypted);
  } catch {
    return { ...base, error: 'AES-256-GCM authentication tag did not verify' };
  }

  let decompressed: Uint8Array;
  try {
    decompressed = zlibDecompress(decryptedPadded);
  } catch (e) {
    return { ...base, error: `not a valid zlib stream: ${(e as Error).message}` };
  }
  if (decompressed.length > MAX_DECOMPRESSED) {
    return { ...base, error: 'oversize zlib stream' };
  }

  base.aesTagValid = true;
  base.debug.decryptedLen = decryptedPadded.length;
  base.debug.decryptedZlibMagic = toHex(decryptedPadded.subarray(0, 4));
  base.debug.decompressedLen = decompressed.length;
  base.debug.decompressedHex = toHex(decompressed.subarray(0, 50));
  base.debug.parsedText = new TextDecoder().decode(decompressed.subarray(0, 100));
  base.triples = parseTriples(decompressed);
  return base;
}

// Upstream provenance: decode.py:139-152 check_sig() (master 547b543)
// Verify the BIP-340 Schnorr signature over taggedHash(TAG, contentBytes) where contentBytes
// = everything after SIG (= WRITER_PUBKEY || READER_ID || GEN || MLKEM_CT || AES).
// No reader-side secrets needed — anyone can verify a record's authenticity from the slot alone.
export function checkSignature(slot: Uint8Array): boolean {
  if (slot.length < DATA_LENGTH) return false;
  const sig = slot.subarray(0, 64);
  const writerPub = slot.subarray(64, 97);
  const contentBytes = slot.subarray(64);
  const prehash = taggedHash(BIP340_TAG, contentBytes);
  const writerXOnly = writerPub.subarray(1, 33);
  return schnorr.verify(sig, prehash, writerXOnly);
}
