import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { CM_PURPOSE, MLKEM_Z_TAG } from './constants.js';
import { taggedHash, concatBytes } from './utils.js';

export interface CmKeys {
  writerPrivKey: Uint8Array;
  readerSecpPrivKey: Uint8Array;
  readerMlkemSeedD: Uint8Array;
  mlkemPublicKey: Uint8Array;
  mlkemSecretKey: Uint8Array;
  writerPubKey: Uint8Array;
  readerSecpPubKey: Uint8Array;
  readerId: Uint8Array;
  writerMlkemSeedD: Uint8Array;
  writerMlkemPublicKey: Uint8Array;
  writerMlkemSecretKey: Uint8Array;
}

// Upstream provenance: bip39.py:83-97 derive_cm_keys (BIP-32 paths) +
// encode.py:47-73 derive_mlkem_keypair (deterministic ML-KEM-1024 keygen from d||z).
// Derives 4 children at m/0x44315441'/N'/{0',1',2',3'}'; the ML-KEM seed is d||z
// where z = BIP-340 tagged hash with tag "centurymetadata v1 mlkem-z".
export function deriveCmKeys(mnemonic: string, n: number = 0, passphrase: string = ''): CmKeys {
  const seed = mnemonicToSeedSync(mnemonic, passphrase);
  const hdRoot = HDKey.fromMasterSeed(seed);

  const purpose = hdRoot.deriveChild((0x80000000 + CM_PURPOSE) >>> 0);
  const coin = purpose.deriveChild((0x80000000 + n) >>> 0);
  const writerChild = coin.deriveChild((0x80000000 + 0) >>> 0);
  const readerSecpChild = coin.deriveChild((0x80000000 + 1) >>> 0);
  const writerMlkemChild = coin.deriveChild((0x80000000 + 2) >>> 0);
  const readerMlkemChild = coin.deriveChild((0x80000000 + 3) >>> 0);

  const writerPrivKey = new Uint8Array(writerChild.privateKey!);
  const readerSecpPrivKey = new Uint8Array(readerSecpChild.privateKey!);
  const readerMlkemSeedD = new Uint8Array(readerMlkemChild.privateKey!);
  const writerMlkemSeedD = new Uint8Array(writerMlkemChild.privateKey!);

  // ML-KEM-1024 (FIPS 203) deterministic keygen: seed = d || z, where d = BIP-32 /3' (or /2') privkey
  // and z = BIP-340 tagged_hash("centurymetadata v1 mlkem-z", d). @noble/post-quantum's
  // keygen(seed) consumes the 64-byte d||z in the same order as upstream's seeded_random().
  const d = readerMlkemSeedD;
  const z = taggedHash(MLKEM_Z_TAG, d);
  const mlkemSeed = concatBytes(d, z);
  const mlkemKeys = ml_kem1024.keygen(mlkemSeed);
  const mlkemPublicKey = new Uint8Array(mlkemKeys.publicKey);
  const mlkemSecretKey = new Uint8Array(mlkemKeys.secretKey);

  const wd = writerMlkemSeedD;
  const wz = taggedHash(MLKEM_Z_TAG, wd);
  const writerMlkemSeed = concatBytes(wd, wz);
  const writerMlkemKeys = ml_kem1024.keygen(writerMlkemSeed);
  const writerMlkemPublicKey = new Uint8Array(writerMlkemKeys.publicKey);
  const writerMlkemSecretKey = new Uint8Array(writerMlkemKeys.secretKey);

  const writerPubKey = new Uint8Array(secp256k1.getPublicKey(writerPrivKey, true));
  const readerSecpPubKey = new Uint8Array(secp256k1.getPublicKey(readerSecpPrivKey, true));
  // Upstream provenance: encode.py:81-83 get_reader_id = SHA256(secp_pubkey || mlkem_pubkey)
  const readerId = sha256(concatBytes(readerSecpPubKey, mlkemPublicKey));

  return {
    writerPrivKey, readerSecpPrivKey, readerMlkemSeedD,
    mlkemPublicKey, mlkemSecretKey, writerPubKey, readerSecpPubKey, readerId,
    writerMlkemSeedD, writerMlkemPublicKey, writerMlkemSecretKey,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Known test identities (upstream known_keys.py scheme).
//
// Upstream provenance: python/centurymetadata/server/known_keys.py + known_words.txt.
// A reader identity is "known" if derived from a BIP-39 mnemonic of a single word
// repeated 12× whose checksum is valid (~130 of 2048 words qualify). When the test
// server runs in TEST_MODE, only known reader_ids may authorize/update records.
// The first half (by wordlist position) are self-authored (WRITER_PUBKEY must match
// the identity's own derived writer key); the second half are reserved for the test
// server's pre-populated example data.
// ─────────────────────────────────────────────────────────────────────────────

// Upstream provenance: python/centurymetadata/server/known_words.txt (byte-exact).
// 130 words whose 12× repeated form has a valid BIP-39 checksum.
export const KNOWN_WORDS: readonly string[] = Object.freeze([
  'action', 'agent', 'aim', 'all', 'ankle', 'announce', 'audit', 'awesome',
  'beef', 'believe', 'blue', 'border', 'brand', 'breeze', 'bus', 'business',
  'cannon', 'canyon', 'carry', 'cave', 'century', 'cereal', 'chronic', 'coast',
  'convince', 'cute', 'dawn', 'dilemma', 'divorce', 'dry', 'elevator', 'else',
  'embrace', 'enroll', 'escape', 'evolve', 'exclude', 'excuse', 'exercise',
  'expire', 'fetch', 'fever', 'forward', 'fury', 'garment', 'gauge', 'gym',
  'half', 'harsh', 'hole', 'hybrid', 'illegal', 'include', 'index', 'into',
  'invest', 'involve', 'jeans', 'kick', 'kite', 'later', 'layer', 'legend',
  'life', 'lyrics', 'margin', 'melody', 'mom', 'more', 'morning', 'nation',
  'neck', 'neglect', 'never', 'noble', 'novel', 'obvious', 'ocean', 'oil',
  'orphan', 'oxygen', 'pause', 'peasant', 'permit', 'piano', 'proof',
  'pumpkin', 'question', 'real', 'report', 'rough', 'rude', 'salad', 'scale',
  'screen', 'sea', 'seat', 'sell', 'seminar', 'seven', 'sheriff', 'siege',
  'silver', 'soldier', 'spell', 'split', 'spray', 'stadium', 'sugar', 'sunny',
  'sure', 'tobacco', 'tongue', 'track', 'tree', 'trouble', 'twelve', 'twice',
  'type', 'uniform', 'useless', 'valid', 'very', 'vibrant', 'virtual', 'vocal',
  'warrior', 'word', 'world', 'yellow',
]);

export const _KNOWN_WORD_INDEX: ReadonlyMap<string, number> = new Map(
  KNOWN_WORDS.map((w, i) => [w, i]),
);

// Upstream provenance: known_keys.py:46-47 — seed = bip39_to_seed(word × 12).
export function knownWordMnemonic(word: string): string {
  return Array.from({ length: 12 }, () => word).join(' ');
}

export function isKnownWord(word: string): boolean {
  return _KNOWN_WORD_INDEX.has(word);
}

// Upstream provenance: known_keys.py:50-55 — first half self-authored, second half example data.
export function isSelfAuthoredWord(word: string): boolean {
  const idx = _KNOWN_WORD_INDEX.get(word);
  if (idx === undefined) return false;
  return idx < Math.floor(KNOWN_WORDS.length / 2);
}

// Valid Bitcoin record examples for each TYPE (for TEST_MODE-compliant writes).
// These match the example CONTENTS in CmRecordTypes.svelte and pass upstream validate.py.
export const RECORD_EXAMPLES: Record<string, { name: string; contents: string }> = {
  'bitcoin psbt': {
    name: 'unsigned tx',
    contents: 'cHNidP8BAHUCAAAAASaBcTce3/KFHeE2a6QAHfxqcrxfHGgG7vid5hU+nQITAAAAAAD+////AomN1gUAAAAAIgAgZEsBukgROqGS8q4Q1Wx0yZ1qE//g4A4ZQ0n6fHiHWoBAAAAAAEAAAAAA6ICAu3/BwAAAAAAIgAgTSmDRIEXKnS6iczWWTiNVrG2sE5Yk1W4n2JnUg0l7pZ/v///wK6Id8CAAAAarinomJt5VlqdetH7sRSkYnVaSEkmCFjOi3h6Uh0gR8BAAAAAAEAAAAAA6ICAu3/BwAAAAAAIgAgDE+ZowK+BR0oIv5MRy0Lfs1fxR4sJt3iS7BFDKedc/v///wK6Id8CAAAAarinomJt5VlqdetH7sRSkYnVaSEkmCFjOi3h6Uh0gR8BAAAAAAEAAAAAA6ICAu3/BwAAAAAA',
  },
  'bitcoin transaction': {
    name: 'genesis coinbase',
    contents: '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000',
  },
  'bitcoin miniscript': {
    name: 'spending policy',
    contents: 'and_v(v:pk(02a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3),older(1000))',
  },
  'bitcoin output script descriptor': {
    name: 'main wallet',
    contents: 'wpkh([d34db33f/84h/0h/0h]xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSojawudHrDrJm7VafwdeFaseB/0/*)#xz7vw3rn',
  },
  'bitcoin wallet labels': {
    name: 'my labels',
    contents: '{"type":"addr","ref":"bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4","label":"savings"}\n{"type":"tx","ref":"f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16","label":"first purchase"}',
  },
};
