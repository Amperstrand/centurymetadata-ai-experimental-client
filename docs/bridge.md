# centurymetadata Bridge — Experimental POC

> **Status**: Experimental proof-of-concept. Nothing is fully working. We are testing the bridge between Nostr (NIP-06) and centurymetadata key derivation from a shared BIP-39 mnemonic.

## Overview

[centurymetadata](https://centurymetadata.org) is a post-quantum key-value store by [Rusty Russell](https://github.com/rustyrussell). Records are encrypted with hybrid cryptography — classical secp256k1 ECDH combined with post-quantum ML-KEM-1024 (FIPS 203) — and stored in XOR-masked bundles on a central server. Only the holder of the correct private keys can find and decrypt their own records.

BlossomFlare bridges Nostr and centurymetadata by deriving both identity systems from a single BIP-39 mnemonic. This means a user who logs into BlossomFlare with a seed phrase already has a centurymetadata identity — no separate key management required.

## Key Derivation

```
BIP-39 Seed
├── m/44'/1237'/0'/0/0           → Nostr identity (NIP-06)
│   └── Used for Blossom auth, Nostr events
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

1. **Data**: `title\0content\0` pairs → gzip (level 9, zero mtime) → zero-pad to 6487 bytes
2. **ECDH**: `SHA256(x_coordinate(writer_priv × reader_secp_pub))` → 32-byte classical secret
3. **ML-KEM**: encapsulate to reader's ML-KEM pubkey → 32-byte post-quantum secret + 1568-byte ciphertext
4. **AES key**: `SHA256(ECDH_secret || ML-KEM_secret)` → 32-byte key
5. **Encrypt**: AES-256-CTR with 16-byte zero IV (nonce=0, counter=0)
6. **Sign**: BIP-340 Schnorr over `taggedHash("centurymetadata v1", WRITER_PUBKEY || READER_ID || GEN || MLKEM_CT || AES)`

An attacker must break **both** ECDH and ML-KEM to decrypt a record.

### Decryption pipeline

1. Fetch bundle via `POST /api/v1/fetchxor/{directory}` (128-byte bitmask body)
2. Scan 8192-byte slots for matching `reader_id` at offset 97
3. Verify BIP-340 signature
4. ECDH: `SHA256(x_coordinate(reader_secp_priv × writer_pub))`
5. ML-KEM decapsulate: `ml_kem1024.decapsulate(MLKEM_CT, reader_mlkem_secret)`
6. AES-256-CTR decrypt → strip gzip → parse `title\0content\0` pairs

## Architecture

```
Browser (Svelte SPA)
├── frontend/src/lib/centurymetadata.ts    Encode/decode/gzip/crypto (Web Crypto + fflate + @noble)
├── frontend/src/components/CenturyMetadata.svelte   8-section interactive explorer
│      (overview, keys, record anatomy, encryption, decryption, security demos, bundle, playground)
├── frontend/src/components/CmRecordAnatomy.svelte      Section 3: clickable 8192-byte slot layout
├── frontend/src/components/CmEncryptionPipeline.svelte Section 4: animated 6-step encode visualizer
├── frontend/src/components/CmDecryptionPipeline.svelte Section 5: animated 6-step decode visualizer (decodeSlot)
├── frontend/src/components/CmSecurityDemos.svelte      Section 6: tamper-detection + wrong-reader demos
├── frontend/src/components/CmBundleSystem.svelte       Section 7: 1024-cell XOR bundle grid + network sample
├── frontend/src/components/CmPlayground.svelte         Section 8: write/fetch/decode round-trip (real test API)
│
└── /cm/api/v1/*  ──→  Worker Proxy (src/routes/centurymetadata.ts)
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

Authtoken is `0`.repeat(64) — the test API's open token.

## Use Cases for BlossomFlare

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

- **Test API only**: all data goes to testapi.centurymetadata.org with authtoken `0`×64 — no authentication
- **No production API**: centurymetadata.org itself does not have a public write API yet
- **Single bundle**: the test API has one bundle (`00-ff`), so all users' records are in the same 8MB blob
- **No generation increment**: the explorer always writes generation 0; a second write fails with "Generation 0 already exists"
- **Bundle scan is O(N)**: fetching reads the entire 8MB bundle and scans every slot for a reader_id match
- **ML-KEM-1024 bundle size**: @noble/post-quantum adds ~9KB to the frontend bundle

## References

- [centurymetadata.org](https://centurymetadata.org) — official spec
- [testapi.centurymetadata.org](https://testapi.centurymetadata.org) — public test API
- [FIPS 203](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.203.pdf) — ML-KEM standard
- [BIP-340](https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki) — Schnorr signatures
- [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) — HD key derivation
- [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md) — Nostr key derivation from mnemonic
- `tests/centurymetadata-roundtrip.mjs` — Node reference implementation
