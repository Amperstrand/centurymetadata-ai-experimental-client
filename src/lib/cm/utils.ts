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

// Upstream provenance: encode.py:88 gen.to_bytes(8, "little") (master 547b543) —
// little-endian int64 generation counter ("Intel won", SPECIFICATION.md rationale 4).
export function int64ToBytesLE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

export function bytesToInt64LE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 7; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
