/**
 * centurymetadata browser-compatible encode/decode — barrel re-export for src/lib/cm/.
 *
 * Ports the Node round-trip test (test/roundtrip.mjs) to use
 * Web Crypto API (AES-CTR), fflate (gzip/inflate), and @noble libs.
 *
 * EXPERIMENTAL / PROOF-OF-CONCEPT — not for production use.
 *
 * == What is centurymetadata? ==
 *
 * centurymetadata (https://centurymetadata.org) is a post-quantum key-value store
 * by Rusty Russell. Records are encrypted with hybrid cryptography (classical ECDH
 * + post-quantum ML-KEM-1024) and stored in XOR-masked "bundles" on a central
 * server. Only the holder of the correct private keys can find and decrypt their
 * own records — other users' records are visible as opaque bytes.
 *
 * == Key derivation (shared BIP-39 mnemonic) ==
 *
 *   BIP-39 Seed
 *   ├── m/44'/1237'/0'/0/0      → Nostr identity (NIP-06)
 *   │
 *   └── m/0x44315441'/0'        → centurymetadata ("D1TA" purpose)
 *       ├── /0' → Writer keypair (BIP-340 Schnorr signing)
 *       ├── /1' → Reader secp256k1 keypair (ECDH)
 *       ├── /2' → Writer ML-KEM-1024 seed (post-quantum, for bidirectional use)
 *       └── /3' → Reader ML-KEM-1024 seed (post-quantum, FIPS 203)
 *
 * 0x44315441 = ASCII "D1TA". ML-KEM seed = d || taggedHash("...mlkem-z", d) (64 bytes).
 * reader_id = SHA256(reader_secp_pubkey || reader_mlkem_pubkey).
 *
 * == Record format (9243 bytes) ==
 *
 *   PREAMBLE[1051] | SIG[64] | WRITER_PUBKEY[33] | READER_ID[32]
 *                 | GEN[8]  | MLKEM_CT[1568]     | AES[6487]
 *
 * - PREAMBLE: human-readable format description (uploaded, not stored in bundle).
 * - SIG: BIP-340 Schnorr signature over taggedHash(TAG, content[64:]).
 * - AES payload: AES-256-CTR(gzip(TYPE\0NAME\0CONTENTS\0 triples), zero-padded to 6487).
 * - AES key: SHA256(ECDH_secret || ML-KEM_secret).
 * - MLKEM_CT: ML-KEM-1024 ciphertext encapsulated to reader's ML-KEM pubkey.
 *
 * == Bundle retrieval ==
 *
 * Records are stored in 8192-byte "slots" within bundles. Each bundle holds up
 * to 1024 slots (1024 × 8192 = 8 MB). Bundles are served via POST
 * /api/v1/fetchxor/{directory} with a 128-byte bitmask selecting which bundles
 * to include (one bit per bundle in the directory, per upstream README
 * "Retrieving Entries"). The server XORs selected bundles together and returns
 * the result (always 8 MB). For a single-bit bitmask, you get the raw bundle
 * (1024 × 8192-byte slots). The client scans for its reader_id at offset 97
 * (SIG[64] + WRITER_PUBKEY[33]) in each slot.
 *
 * == Browser-specific notes ==
 *
 * - Node's `crypto.createCipheriv('aes-256-ctr', ...)` → Web Crypto `crypto.subtle`
 * - Node's `zlib.gzipSync` → fflate's `gzipSync` (zero mtime field bytes 4-7)
 * - Node's `zlib.gunzipSync` → fflate's `inflateSync` after manual gzip header
 *   parsing (gunzipSync returns empty on padded data; inflateSync stops at the
 *   DEFLATE end-of-stream marker and ignores trailing zero padding)
 * - API calls go through the Worker proxy at /cm/* (test API has no CORS headers)
 *
 * @see https://centurymetadata.org
 * @see https://testapi.centurymetadata.org
 * @see test/roundtrip.mjs (Node reference implementation)
 */
export * from './constants.js';
export * from './utils.js';
export * from './crypto.js';
export * from './keys.js';
export * from './encode.js';
export * from './decode.js';
export * from './network.js';
export * from './types.js';
export * from './display.js';
