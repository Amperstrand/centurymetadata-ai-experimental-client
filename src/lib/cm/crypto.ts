import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { zlibSync, unzlibSync } from 'fflate';

// Upstream provenance: encode.py:79-81 get_ecdh_secret (master 547b543)
// libsecp256k1 ECDH default hashfn = SHA256 of the full 33-byte compressed shared point.
// @noble/curves' getSharedSecret returns the 33-byte compressed point [0x02|0x03, x(32), y(32)];
// we hash all 33 bytes. (Pre-547b543 this port hashed only the 32-byte x-coordinate — see
// docs/audits/results/CM-WIRE-FORMAT-result.md; SPECIFICATION.md now pins the 33-byte form.)
// CM/File Format: ECDH_SECRET: EC Diffie-Hellman of WRITER_PUBKEY and READER_SECP_PRIVKEY = SHA256(33-byte compressed WRITER_PUBKEY*READER_SECP_PRIVKEY)
export function computeEcdh(myPrivKey: Uint8Array, theirPubKeyCompressed: Uint8Array): Uint8Array {
  const shared = secp256k1.getSharedSecret(myPrivKey, theirPubKeyCompressed);
  return sha256(shared);
}

// Upstream provenance: encode.py:10-32 compress (master 547b543)
// zlib.compress(raw, level=9) — plain zlib stream (RFC 1950, no FDICT), NOT gzip.
// The old gzip OS-byte patching is gone: zlib streams carry no platform-dependent bytes.
// Caller pads with zeroes to PLAINTEXT_LENGTH (14663).
export function zlibCompress(data: Uint8Array): Uint8Array {
  return zlibSync(data, { level: 9 });
}

// Upstream provenance: decode.py:27-59 decompress (master 547b543)
// The AES payload is a zlib stream zero-padded to PLAINTEXT_LENGTH; the reader
// MUST ignore any bytes after the zlib stream. fflate's unzlibSync inflates the
// embedded DEFLATE stream and stops at its end-of-stream marker, ignoring the
// trailing zero padding.
export function zlibDecompress(data: Uint8Array): Uint8Array {
  return unzlibSync(data);
}

// Upstream provenance: encode.py:34-45 aes / decode.py:120-137 unaes (master 547b543)
// AES-256-GCM with a 12-byte all-zero nonce; the 16-byte authentication tag is
// appended to the ciphertext (Web Crypto's encrypt() output is ciphertext||tag,
// which matches upstream's `ciphertext + tag`). decrypt() verifies the tag and
// throws on mismatch.
// CM/File Format: AES: AES-256-GCM using AESKEY, 12-byte all-zero nonce, of DATA; 16-byte authentication tag appended
export async function aesGcmEncrypt(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'AES-GCM' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128 },
    cryptoKey,
    new Uint8Array(data),
  );
  return new Uint8Array(encrypted);
}

// Upstream provenance: decode.py:120-137 unaes (decryption counterpart of encode.py:34-45 aes).
// Throws if the trailing GCM tag does not verify (corrupt data or wrong key).
export async function aesGcmDecrypt(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128 },
    cryptoKey,
    new Uint8Array(data),
  );
  return new Uint8Array(decrypted);
}
