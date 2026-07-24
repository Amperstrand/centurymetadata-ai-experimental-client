import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { DATA_LENGTH, BIP340_TAG, PREAMBLE } from './constants.js';
import { concatBytes, taggedHash, int64ToBytesBE, toHex } from './utils.js';
import { computeEcdh, gzipCompress, aesCtrEncrypt } from './crypto.js';
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

// Upstream provenance: encode.py:101-113 encode()
// Pipeline: compress triples → ECDH(writer_priv, reader_secp_pub) → ML-KEM encapsulate(reader_mlkem_pub)
// → AESKEY = SHA256(ECDH || ML-KEM) → AES-256-CTR encrypt → sign contentBytes with BIP-340.
// Output: PREAMBLE || SIG || contentBytes, total 1051 + 8192 = 9243 bytes.
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
