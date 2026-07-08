/**
 * Nostr (NIP-06) key derivation + npub (NIP-19) + kind-1 note signing.
 *
 * The bridge: the SAME BIP-39 mnemonic derives BOTH a Nostr identity (here,
 * NIP-06 path m/44'/1237'/0'/0/0) AND a centurymetadata identity (lib/centurymetadata.ts,
 * m/0x44315441'/0'/...). One seed → two cryptographically-independent ecosystems.
 *
 * No new deps: @noble/curves (Schnorr), @noble/hashes (sha256), @scure/bip32/bip39.
 */

import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';

export interface NostrKeys {
  privKey: Uint8Array;      // 32 bytes
  pubKeyXOnly: Uint8Array;  // 32 bytes (x-only — used in Nostr event ids)
  pubKeyCompressed: Uint8Array; // 33 bytes (for display/ECDH-style ops)
}

export function deriveNostrKeys(mnemonic: string): NostrKeys {
  const seed = mnemonicToSeedSync(mnemonic);
  const hd = HDKey.fromMasterSeed(seed);
  // NIP-06: m/44'/1237'/0'/0/0
  const child = hd.derive("m/44'/1237'/0'/0/0");
  if (!child.privateKey) throw new Error('Nostr derivation failed (no private key)');
  const privKey = new Uint8Array(child.privateKey);
  const pubKeyCompressed = new Uint8Array(secp256k1.getPublicKey(privKey, true));
  const pubKeyXOnly = pubKeyCompressed.subarray(1, 33);
  return { privKey, pubKeyXOnly, pubKeyCompressed };
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- bech32 (NIP-19 npub encoding) ----------------------------------------
// Standard bech32 (constant 1, not bech32m). Charset per BIP-173.
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(values: number[]): number {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if (((top >> i) & 1) === 1) chk ^= gen[i];
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  return [...hrp].flatMap((c) => [c.charCodeAt(0) >> 5, c.charCodeAt(0) & 0x1f]);
}

function convertBits(bytes: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0, bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const value of bytes) {
    if (value < 0 || (value >> fromBits) !== 0) throw new Error('invalid byte');
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  return ret;
}

export function npubEncode(pubKeyXOnly: Uint8Array): string {
  const data = convertBits(pubKeyXOnly, 8, 5, true);
  const hrp = 'npub';
  const values = [...hrpExpand(hrp), 0, ...data, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >> 5 * (5 - i)) & 0x1f);
  return hrp + '1' + [...data, ...checksum].map((v) => CHARSET[v]).join('');
}

// --- kind-1 note signing ---------------------------------------------------
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export function signNote(privKey: Uint8Array, pubKeyXOnly: Uint8Array, content: string): NostrEvent {
  const created_at = Math.floor(Date.now() / 1000);
  const tags: string[][] = [];
  const serialized = JSON.stringify([0, toHex(pubKeyXOnly), created_at, 1, tags, content]);
  const id = sha256(new TextEncoder().encode(serialized));
  const sig = schnorr.sign(id, privKey);
  return {
    id: toHex(id),
    pubkey: toHex(pubKeyXOnly),
    created_at,
    kind: 1,
    tags,
    content,
    sig: toHex(sig),
  };
}

export function verifyNoteId(ev: NostrEvent): boolean {
  const serialized = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  return toHex(sha256(new TextEncoder().encode(serialized))) === ev.id;
}
