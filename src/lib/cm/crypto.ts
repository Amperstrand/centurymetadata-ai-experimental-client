import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gzipSync, inflateSync } from 'fflate';

// Upstream provenance: encode.py:76-78 get_ecdh_secret
// libsecp256k1 ECDH default hashfn = SHA256(x-coordinate of the shared point).
// @noble/curves' getSharedSecret returns compressed point [0x02|0x03, x(32), y(32)];
// we hash bytes [1..33] = the x coordinate.
export function computeEcdh(myPrivKey: Uint8Array, theirPubKeyCompressed: Uint8Array): Uint8Array {
  const shared = secp256k1.getSharedSecret(myPrivKey, theirPubKeyCompressed);
  return sha256(shared.subarray(1, 33));
}

// Upstream provenance: encode.py:10-29 compress
// gzip.compress(raw, mtime=0) then patch OS byte (offset 9) to 0xff for
// cross-platform reproducibility (commit 63baef2, 2026-07-08). ljust to DATA_LENGTH.
export function gzipCompress(data: Uint8Array): Uint8Array {
  const result = gzipSync(data, { level: 9 });
  result[4] = 0; result[5] = 0; result[6] = 0; result[7] = 0;
  if (result.length > 9) result[9] = 0xff;
  return result;
}

// Browser-specific: fflate.gunzipSync returns empty on padded data (the AES payload
// is zero-padded to DATA_LENGTH). Workaround: parse the RFC-1952 gzip header
// manually and feed the raw DEFLATE stream to inflateSync, which stops at the
// end-of-stream marker and ignores trailing zeros. See docs/bridge.md "gunzipSync bug".
export function gzipDecompress(data: Uint8Array): Uint8Array {
  const FLG = data[3];
  let offset = 10;
  if (FLG & 0x04) { const xlen = data[offset] | (data[offset + 1] << 8); offset += 2 + xlen; }
  if (FLG & 0x08) { while (data[offset] !== 0) offset++; offset++; }
  if (FLG & 0x10) { while (data[offset] !== 0) offset++; offset++; }
  if (FLG & 0x02) { offset += 2; }
  return inflateSync(data.subarray(offset));
}

// Upstream provenance: encode.py:32-38 aes / decode.py:25-31 unaes
// AES-256-CTR with 8-byte nonce + 8-byte counter (both zero) — matches Python
// `AES.new(key=aeskey, mode=AES.MODE_CTR, nonce=bytes(8))`.
export async function aesCtrEncrypt(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'AES-CTR' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CTR', counter: new Uint8Array(16), length: 128 },
    cryptoKey,
    new Uint8Array(data),
  );
  return new Uint8Array(encrypted);
}

// Upstream provenance: decode.py:25-31 unaes (decryption counterpart of encode.py:32-38 aes).
export async function aesCtrDecrypt(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'AES-CTR' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: new Uint8Array(16), length: 128 },
    cryptoKey,
    new Uint8Array(data),
  );
  return new Uint8Array(decrypted);
}
