import { sha256 } from '@noble/hashes/sha2.js';

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

// Upstream provenance: python/centurymetadata/encode.py:41-44 bip340_tagged_hash
// BIP-340 tagged hash: SHA256(SHA256(tag) || SHA256(tag) || msg)
export function taggedHash(tag: string, msg: Uint8Array): Uint8Array {
  const tagBytes = new TextEncoder().encode(tag);
  const tagHash = sha256(tagBytes);
  return sha256(concatBytes(tagHash, tagHash, msg));
}

// Upstream provenance: encode.py:104-109 get_aeskey() / gen.to_bytes(8, "little")
// CM: MUST encode `GEN` as an 8-byte little-endian unsigned integer.
export function int64ToBytesLE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

export function bytesLEToInt64(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) {
    v = (v << 8n) | BigInt(bytes[i]);
  }
  return v;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Upstream provenance: python bytes.split(bytes(1)) semantics -- splits on every
// single occurrence of `sep`, keeping empty segments (including a trailing empty
// segment when the data ends with `sep`).
export function splitBytes(buf: Uint8Array, sep: number): Uint8Array[] {
  const parts: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === sep) {
      parts.push(buf.subarray(start, i));
      start = i + 1;
    }
  }
  parts.push(buf.subarray(start));
  return parts;
}
