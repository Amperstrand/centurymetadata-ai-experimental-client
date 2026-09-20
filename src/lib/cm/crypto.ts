import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { zlibSync, inflateSync } from 'fflate';

// Upstream provenance: python/centurymetadata/encode.py get_ecdh_secret() (SPECIFICATION.md 2026-07 rewrite
// made this explicit: "ECDH_SECRET: ... = SHA256(33-byte compressed WRITER_PUBKEY*READER_SECP_PRIVKEY)").
// libsecp256k1's default ecdh() hash function is SHA256 of the full 33-byte compressed shared point
// (0x02/0x03 prefix included) -- NOT just the 32-byte x-coordinate.
// CM: ECDH_SECRET: EC Diffie-Hellman of WRITER_PUBKEY and READER_SECP_PRIVKEY = SHA256(33-byte compressed WRITER_PUBKEY*READER_SECP_PRIVKEY)
export function computeEcdh(myPrivKey: Uint8Array, theirPubKeyCompressed: Uint8Array): Uint8Array {
  const shared = secp256k1.getSharedSecret(myPrivKey, theirPubKeyCompressed, true);
  return sha256(shared);
}

// Upstream provenance: python/centurymetadata/encode.py:10-36 compress()
// zlib (RFC 1950), not gzip (RFC 1952) -- no OS byte / mtime reproducibility concerns,
// since zlib's 2-byte header carries no such metadata.
// CM: MUST compress the terminated tuples using the [zlib](#ref-zlib) protocol:
//   - MUST NOT set FDICT.
export function zlibCompress(data: Uint8Array): Uint8Array {
  return zlibSync(data, { level: 9 });
}

export interface ZlibInflateResult {
  ok: boolean;
  // True only when ok is false: header was fine but the stream ends before
  // its logical end (ran out of input) -- distinct from "not zlib at all".
  truncated: boolean;
  data?: Uint8Array;
}

// Upstream provenance: python/centurymetadata/decode.py:57-98 decompress()
// Validates the 2-byte RFC-1950 zlib header ourselves (CM/CMF+FLG checksum, FDICT unset,
// compression method = deflate), then inflates the raw DEFLATE body with fflate's
// single-shot inflateSync. inflateSync stops at the DEFLATE end-of-stream marker
// (ignoring the trailing 4-byte Adler32 + zero padding that follow it in our fixed-size
// buffer) and throws with `.code === 0` ("unexpected EOF") specifically when the stream
// runs out of input before that marker -- which is how we tell BAD_ZLIB (not a valid
// zlib stream at all) apart from TRUNCATED_ZLIB (valid so far, but cut short).
export function zlibDecompress(data: Uint8Array): ZlibInflateResult {
  if (data.length < 2) return { ok: false, truncated: false };
  const cmf = data[0];
  const flg = data[1];
  // CM: MUST NOT set FDICT.
  if ((cmf & 0x0f) !== 8 || (cmf << 8 | flg) % 31 !== 0 || (flg & 0x20) !== 0) {
    return { ok: false, truncated: false };
  }
  try {
    return { ok: true, truncated: false, data: inflateSync(data.subarray(2)) };
  } catch (e) {
    return { ok: false, truncated: (e as { code?: number }).code === 0 };
  }
}

// Upstream provenance: python/centurymetadata/encode.py:39-50 aes() / decode.py:168-189 unaes()
// AES-256-GCM, 12-byte all-zero nonce; Web Crypto appends/expects the 16-byte tag
// concatenated onto the ciphertext, matching AESKEY|ciphertext|tag = AES_LENGTH.
// CM: AES: AES-256-GCM using AESKEY, 12-byte all-zero nonce, of DATA; 16-byte authentication tag appended
export async function aesGcmEncrypt(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'AES-GCM' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128 },
    cryptoKey,
    new Uint8Array(data),
  );
  return new Uint8Array(encrypted);
}

// Returns null if the trailing 16-byte authentication tag does not verify.
// CM: MUST fail parsing if the trailing 16-byte authentication tag does not verify.
export async function aesGcmDecrypt(key: Uint8Array, data: Uint8Array): Promise<Uint8Array | null> {
  const cryptoKey = await crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'AES-GCM' }, false, ['decrypt']);
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128 },
      cryptoKey,
      new Uint8Array(data),
    );
    return new Uint8Array(decrypted);
  } catch {
    return null;
  }
}
