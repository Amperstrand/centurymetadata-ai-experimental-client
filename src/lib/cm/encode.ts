import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { PLAINTEXT_LENGTH, BIP340_TAG, PREAMBLE } from './constants.js';
import { concatBytes, taggedHash, int64ToBytesLE, toHex } from './utils.js';
import { computeEcdh, zlibCompress, aesGcmEncrypt } from './crypto.js';
import { CmKeys } from './keys.js';

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

// Upstream provenance: python/centurymetadata/encode.py:130-158 encode() + compress()/get_aeskey()/contents().
// Pipeline: compress triples (zlib) → ECDH(writer_priv, reader_secp_pub) → ML-KEM encapsulate(reader_mlkem_pub)
// → AESKEY = SHA256(ECDH|MLKEM|GEN) → AES-256-GCM encrypt → sign contentBytes with BIP-340.
// Output: PREAMBLE || SIG || contentBytes, total 1187 + 16384 = 17571 bytes.
export async function encodeRecord(
  keys: CmKeys,
  triples: Array<[string, string, string]>,
  generation: bigint = 0n,
): Promise<EncodedRecord> {
  const ecdhSecret = computeEcdh(keys.writerPrivKey, keys.readerSecpPubKey);

  const encap = ml_kem1024.encapsulate(keys.mlkemPublicKey);
  const mlkemCt = new Uint8Array(encap.cipherText);
  const mlkemSecret = new Uint8Array(encap.sharedSecret);

  const genBytes = int64ToBytesLE(generation);

  // CM: AESKEY: SHA256(ECDH_SECRET|MLKEM_SECRET|GEN)
  const aesKey = sha256(concatBytes(ecdhSecret, mlkemSecret, genBytes));

  // CM: DATA: ZLIB([TYPE\0NAME\0CONTENTS\0]+), padded with 0 bytes to 14663
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [type, name, contents] of triples) {
    const nameBytes = encoder.encode(name);
    // CM: MUST limit `NAME` fields to 255 bytes.
    if (nameBytes.length > 255) {
      throw new Error(`NAME field too long: ${nameBytes.length} bytes (max 255)`);
    }
    parts.push(encoder.encode(type), new Uint8Array([0]),
               nameBytes, new Uint8Array([0]),
               encoder.encode(contents), new Uint8Array([0]));
  }
  const rawData = concatBytes(...parts);
  const compressed = zlibCompress(rawData);
  if (compressed.length > PLAINTEXT_LENGTH) {
    throw new Error(`Compressed length too great: ${compressed.length} > ${PLAINTEXT_LENGTH}`);
  }
  // CM: MUST pad the compressed stream with 0 bytes to make it 14663 bytes long.
  const padded = new Uint8Array(PLAINTEXT_LENGTH);
  padded.set(compressed);

  const encrypted = await aesGcmEncrypt(aesKey, padded);

  const contentBytes = concatBytes(
    keys.writerPubKey,
    keys.readerId,
    genBytes,
    mlkemCt,
    encrypted,
  );

  // CM: SIG: BIP-340 SHA256(TAG|TAG|WRITER_PUBKEY|READER_ID|GEN|MLKEM_CT|AES)
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
