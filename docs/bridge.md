# centurymetadata Bridge — Experimental POC

> **Status**: Experimental proof-of-concept. Nothing is fully working. We are testing the bridge between Nostr (NIP-06) and centurymetadata key derivation from a shared BIP-39 mnemonic.

## Overview

[centurymetadata](https://centurymetadata.org) is a post-quantum key-value store by [Rusty Russell](https://github.com/rustyrussell). Records are encrypted with hybrid cryptography — classical secp256k1 ECDH combined with post-quantum ML-KEM-1024 (FIPS 203) — and stored in XOR-masked bundles on a central server. Only the holder of the correct private keys can find and decrypt their own records.

This client bridges Nostr and centurymetadata by deriving both identity systems from a single BIP-39 mnemonic (a concept originally prototyped in the parent BlossomFlare project). A user who logs in with a seed phrase already has a centurymetadata identity — no separate key management required.

> **Note**: This repo (`centurymetadata-ai-experimental-client`) is a read-only learning client extracted from BlossomFlare. The bridge concepts below were designed for BlossomFlare; they are NOT implemented here.

## Key Derivation

```
BIP-39 Seed
├── m/44'/1237'/0'/0/0           → Nostr identity (NIP-06)
│   └── Used for Nostr events (NIP-06 identity)
│
└── m/0x44315441'/0'             → centurymetadata ("D1TA" purpose)
    ├── /0' → Writer keypair     → BIP-340 Schnorr signing
    ├── /1' → Reader secp256k1   → ECDH key exchange
    └── /3' → Reader ML-KEM seed → Post-quantum encapsulation (FIPS 203)
```

- `0x44315441` = ASCII "D1TA" — centurymetadata's own BIP-32 purpose code
- ML-KEM seed = `d || taggedHash("centurymetadata v1 mlkem-z", d)` where d = `/3'` private key (64 bytes total)
- `reader_id` = `SHA256(reader_secp_pubkey || reader_mlkem_pubkey)` — the user's address in the bundle

Keys are cryptographically independent across the two systems despite sharing a seed.

## Record Format

Each upload is 9243 bytes:

```
PREAMBLE[1051] | SIG[64] | WRITER_PUBKEY[33] | READER_ID[32] | GEN[8] | MLKEM_CT[1568] | AES[6487]
```

| Field | Size | Description |
|---|---|---|
| PREAMBLE | 1051 | Human-readable format spec (uploaded, not stored in bundle) |
| SIG | 64 | BIP-340 Schnorr signature over `taggedHash(TAG, content[64:])` |
| WRITER_PUBKEY | 33 | Compressed secp256k1 public key of the writer |
| READER_ID | 32 | `SHA256(reader_secp_pubkey || reader_mlkem_pubkey)` |
| GEN | 8 | Generation number (big-endian int64, starts at 0) |
| MLKEM_CT | 1568 | ML-KEM-1024 ciphertext encapsulated to reader's ML-KEM key |
| AES | 6487 | AES-256-CTR encrypted gzip payload, zero-padded |

### Encryption pipeline

Per upstream `python/centurymetadata/encode.py:101-113` (`encode()`):

1. **Data**: `TYPE\0NAME\0CONTENTS\0` triples → gzip (level 9, mtime=0, OS byte forced to 0xff) → zero-pad to 6487 bytes
2. **ECDH**: `SHA256(x_coordinate(writer_priv × reader_secp_pub))` → 32-byte classical secret (upstream `encode.py:76-78 get_ecdh_secret`)
3. **ML-KEM**: encapsulate to reader's ML-KEM pubkey → 32-byte post-quantum secret + 1568-byte ciphertext (FIPS 203)
4. **AES key**: `SHA256(ECDH_secret || ML-KEM_secret)` → 32-byte key (upstream `encode.py:86-88 get_aeskey`)
5. **Encrypt**: AES-256-CTR with 8-byte zero nonce + 8-byte zero counter (upstream `encode.py:32-38 aes`)
6. **Sign**: BIP-340 Schnorr over `taggedHash("centurymetadata v1", WRITER_PUBKEY || READER_ID || GEN || MLKEM_CT || AES)` (upstream `encode.py:91-94 contents` + `:97-98 sign`)

An attacker must break **both** ECDH and ML-KEM to decrypt a record.

### Decryption pipeline

Per upstream `python/centurymetadata/decode.py:76-92` (`decode()`):

1. Fetch bundle via `POST /api/v1/fetchxor/{directory}` (128-byte bitmask selecting bundles in the directory)
2. Scan the 1024 × 8192-byte slots in the returned bundle for matching `reader_id` at offset 97
3. Verify BIP-340 signature (upstream `decode.py:52-60 check_sig`)
4. ECDH: `SHA256(x_coordinate(reader_secp_priv × writer_pub))` (upstream `encode.py:76-78`)
5. ML-KEM decapsulate: `ml_kem1024.decapsulate(MLKEM_CT, reader_mlkem_secret)` (FIPS 203)
6. AES-256-CTR decrypt → strip gzip → parse `TYPE\0NAME\0CONTENTS\0` triples (upstream `decode.py:10-22 decompress`)

## Architecture

```
Browser (Svelte SPA)
├── src/lib/centurymetadata.ts                   Encode/decode/gzip/crypto (Web Crypto + fflate + @noble)
├── src/components/CenturyMetadata.svelte        14-section interactive explorer
│      (overview, keys, record anatomy, record types, slot packing, encryption,
│       decryption, security demos, why hybrid, browser crypto, node vs browser,
│       bundle, XOR privacy, playground)
├── src/components/CmRecordAnatomy.svelte         Section 3: clickable 8192-byte slot layout
├── src/components/CmEncryptionPipeline.svelte    Section 6: animated 6-step encode visualizer
├── src/components/CmDecryptionPipeline.svelte    Section 7: animated 6-step decode visualizer (decodeSlot)
├── src/components/CmSecurityDemos.svelte         Section 8: tamper-detection + wrong-reader demos
├── src/components/CmBundleSystem.svelte          Section 12: 1024-cell XOR bundle grid + network sample
├── src/components/CmPlayground.svelte            Section 14: write/fetch/decode round-trip (real test API)
│
└── /cm/api/v1/*  ──→  Pages Function proxy (functions/cm/[[path]].ts)
                        │
                        └──→  https://testapi.centurymetadata.org/api/v1/*
                              (no CORS — proxy adds Access-Control-Allow-Origin: *)
```

The Worker proxy exists because testapi.centurymetadata.org is Apache with no CORS headers. The proxy forwards requests verbatim and adds `Access-Control-Allow-Origin: *` to the response.

## API Endpoints (proxied via /cm/)

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/cm/api/v1/listbundles` | — | List bundle directories `[{"directory":"00-ff","index":0}]` |
| POST | `/cm/api/v1/authorize/{readerId}/{writerPub}/{authtoken}` | empty | Authorize writer for reader_id |
| POST | `/cm/api/v1/update` | 9243 bytes | Upload a record (preamble + slot) |
| POST | `/cm/api/v1/fetchxor/{directory}` | 128-byte bitmask | Fetch XOR'd bundle data |

Authtoken is `"0" * 64` — the test API's open token, hard-coded in `python/centurymetadata/server/server.py:240-243` (`authorize()` rejects any other value with HTTP 403). The test API is not running in `TEST_MODE` today, so it does not enforce the known-keys scheme; see [`docs/SPEC-DRIFT.md`](SPEC-DRIFT.md) for the deployment-lag inventory.

## Use Cases

These were the original motivations for the parent BlossomFlare project this client was extracted from. They are not implemented here; this repo is a read-only learning client.

1. **Blob metadata backup**: auto-write blob hashes, expiry, and ownership to centurymetadata on upload, surviving even if D1 metadata is lost
2. **Post-quantum metadata layer**: client-side encrypt D1 metadata with quantum-resistant keys before storing
3. **Cross-server portability**: use centurymetadata as a rendezvous point for blob metadata across different Blossom servers
4. **Long-term attestations**: timestamp and sign file integrity proofs that outlive the CDN itself

## Browser Implementation Notes

| Node (test script) | Browser (this lib) | Why |
|---|---|---|
| `crypto.createCipheriv('aes-256-ctr', key, iv)` | `crypto.subtle.encrypt({name:'AES-CTR', counter, length:128}, ...)` | Web Crypto API |
| `zlib.gzipSync(data, {level:9})` | `fflate.gzipSync(data, {level:9})` | Browser-compatible |
| `zlib.gunzipSync(paddedData)` | `fflate.inflateSync(data.subarray(headerLen))` | `gunzipSync` returns empty on padded data; `inflateSync` stops at DEFLATE end-of-stream and ignores trailing zeros |
| `Buffer.concat([...])` | Manual `concatBytes(...)` | No Buffer in browser |
| `Buffer.alloc(16, 0)` | `new Uint8Array(16)` | No Buffer in browser |

### The gunzipSync bug

fflate's `gunzipSync` returns an empty `Uint8Array` when given gzip data followed by trailing zero bytes (which centurymetadata uses to pad the AES payload to 6487 bytes). The fix: parse the gzip header (RFC 1952) manually and pass the raw DEFLATE stream to `inflateSync`, which stops at the end-of-stream marker and ignores trailing data.

## Known Limitations

- **Test API only**: all data goes to testapi.centurymetadata.org with authtoken `"0" * 64` — no production CM API exists yet (upstream)
- **Single directory, single bundle**: the test API currently has one directory (`00-ff`) containing one bundle (also `00-ff`) holding 1024 slot positions — all users' records share the same 8 MB blob
- **No generation increment in the UI**: the explorer always writes generation 0; a second write to the same (reader, writer) pair fails with HTTP 400 "Generation 0 already exists" (upstream `server.py:321-323`)
- **Bundle scan is O(N)**: fetching reads the entire 8 MB response and scans every 8192-byte slot for a reader_id match
- **ML-KEM-1024 bundle size**: @noble/post-quantum adds ~9 KB to the frontend bundle
- **Deployment lag**: as of 2026-07-22 the public test API serves the pre-2026-07-08 spec; see [`docs/SPEC-DRIFT.md`](SPEC-DRIFT.md)

## References

### Project

- [centurymetadata.org](https://centurymetadata.org) — official site
- [testapi.centurymetadata.org](https://testapi.centurymetadata.org) — public test API
- [rustyrussell/centurymetadata (GitHub)](https://github.com/rustyrussell/centurymetadata) — reference implementation (Python, MIT)
- [`docs/SPEC-DRIFT.md`](SPEC-DRIFT.md) — drift between this client and upstream master HEAD
- [`CHANGELOG.md`](../CHANGELOG.md) — release history for this client
- [`LICENSE`](../LICENSE) — MIT, with third-party notice crediting Rusty Russell
- [`test/roundtrip.mjs`](../test/roundtrip.mjs) — Node reference implementation (mirrors upstream `examples/centurytool.py`)

### Specifications implemented

- [FIPS 203](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.203.pdf) — ML-KEM (lattice-based KEM, used for the post-quantum half of the hybrid encryption)
- [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) — HD key derivation (`m/0x44315441'/N'/{0',1',2',3'}'`)
- [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) — mnemonic seed phrases
- [BIP-340](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki) — Schnorr signatures over secp256k1 (also defines the tagged-hash construction used for the ML-KEM seed derivation `z`)
- [BIP-380](https://github.com/bitcoin/bips/blob/master/bip-0380.mediawiki) — Output Script Descriptors (one of the 5 accepted Bitcoin record types)
- [BIP-329](https://github.com/bitcoin/bips/blob/master/bip-0329.mediawiki) — Wallet Labels (one of the 5 accepted Bitcoin record types)
- [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md) — Nostr key derivation from mnemonic seed
- [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) — bech32 entity encoding (npub, used by `src/lib/nostr.ts`)
