import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { MLKEM_CT_LENGTH, BIP340_TAG, FULL_LENGTH } from './constants.js';
import { concatBytes, taggedHash, toHex } from './utils.js';
import { computeEcdh, gzipDecompress, aesCtrDecrypt } from './crypto.js';
import { CmKeys } from './keys.js';

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

// Upstream provenance: decode.py:76-93 decode() + decode.py:34-49 split_parts() + decode.py:52-60 check_sig().
// Inverse of encodeRecord: split slot → verify BIP-340 sig over taggedHash(BIP340_TAG, contentBytes)
// → ECDH(reader_secp_priv, writer_pub) → ML-KEM decapsulate → AES decrypt → decompress → split triples.
// Returns sigValid=false on bad signature; caller decides whether to trust the parsed triples.
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

// Upstream provenance: decode.py:52-60 check_sig() + decode.py:34-49 split_parts()
// Verify the BIP-340 Schnorr signature over taggedHash(TAG, contentBytes) where contentBytes
// = everything after SIG (= WRITER_PUBKEY || READER_ID || GEN || MLKEM_CT || AES).
// No reader-side secrets needed — anyone can verify a record's authenticity from the slot alone.
export function checkSignature(slot: Uint8Array): boolean {
  if (slot.length < FULL_LENGTH) return false;
  const sig = slot.subarray(0, 64);
  const writerPub = slot.subarray(64, 97);
  const contentBytes = slot.subarray(64);
  const prehash = taggedHash(BIP340_TAG, contentBytes);
  const writerXOnly = writerPub.subarray(1, 33);
  return schnorr.verify(sig, prehash, writerXOnly);
}
