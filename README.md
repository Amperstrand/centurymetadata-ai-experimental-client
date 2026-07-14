# centurymetadata-ai-experimental-client

An interactive learning client for [centurymetadata](https://centurymetadata.org) — the post-quantum key-value store by [Rusty Russell](https://github.com/rustyrussell). **Experimental / proof-of-concept.** Not production, not affiliated with upstream.

> 🌐 **Live demo:** <https://centurymetadata-ai-experimental-client.pages.dev> · 📁 **Source:** <https://github.com/Amperstrand/centurymetadata-ai-experimental-client>

> Extracted from [blossomflare](https://github.com/Amperstrand/blossomflare). The git history of these files lives there; this repo starts a focused experimental client whose only goal is to **explore, learn, and demo** centurymetadata.

## What it shows

A single-page explorer walks through the whole system, end to end — 14 interactive sections:

1. **The Big Picture** — one BIP-39 seed → two ecosystems (Nostr + centurymetadata)
2. **Keys & Identity** — live `m/0x44315441'/0'/{0',1',2',3'}` ("D1TA") derivation, including writer ML-KEM
3. **Record Anatomy** — the 8192-byte slot byte-by-byte, plus the self-documenting preamble
4. **Bitcoin Record Types** — interactive validator for all 5 accepted types (PSBT, transaction, miniscript, descriptor, BIP-329 labels)
5. **Slot Packing** — live gzip compression showing how multiple records fit in one 6487-byte budget
6. **Encryption** — animated 6-step hybrid pipeline (ECDH + ML-KEM-1024 → AES-256-CTR → BIP-340)
7. **Decryption** — the reverse pipeline, with live values
8. **Security Demos** — tamper-detection, wrong-reader confidentiality, and public signature verification without private keys
9. **Why Hybrid** — concrete what-if scenarios for quantum + cryptanalysis failure
10. **Browser Crypto** — the gunzip-on-padded-data bug, gzip OS byte fix, AES/ECDH/Buffer porting gotchas
11. **Node vs Browser** — side-by-side API comparison tables
12. **The Bundle** — 1024-slot XOR-masked grid, fetchdepth routing, network sample from the public test API
13. **XOR Privacy** — animated 5-step two-server XOR-PIR retrieval demo
14. **Playground** — write a real encrypted record, fetch it back, watch it decrypt

Records use **hybrid cryptography**: classical ECDH (breakable by a future quantum computer) **plus** post-quantum ML-KEM-1024 (FIPS 203, lattice-based). An attacker must break **both** to decrypt.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173/
```

The client-side demos (keys, encryption, decryption, tamper, wrong-reader) need **no network**. The Bundle and Playground sections call `/cm/api/v1/*`, which the Pages Function (`functions/cm/[[path]].ts`) proxies to `testapi.centurymetadata.org`. Under `npm run dev` / `vite preview` there is no proxy, so those two sections show empty states — use `npm run build && npx wrangler pages dev` for a local full-stack run, or the deployed URL.

## Deploy

Cloudflare Pages (static SPA + Pages Function proxy):

```bash
npm run build
npx wrangler pages deploy dist --project-name centurymetadata-ai-experimental-client
```

## Test

```bash
npm run test:roundtrip        # Node reference: full encode → upload → fetch → decode round-trip
SERVER=<url> npm run test:e2e # Playwright suite (84 tests across 10 suites)
```

## Layout

```
src/lib/centurymetadata.ts             crypto: keys, encode/decode (TYPE\0NAME\0CONTENTS\0 triples), gzip, AES-CTR, network scan, checkSignature
src/lib/nostr.ts                       NIP-06 key derivation + note signing
src/components/CenturyMetadata.svelte  14-section explorer shell with sticky nav + guided tour
src/components/Cm*.svelte              per-section sub-components (16 files)
src/components/NostrIdentity.svelte    live Nostr bridge (one seed → two identities)
src/components/TourMode.svelte         guided tour through all 14 sections
functions/cm/[[path]].ts              CORS proxy → testapi.centurymetadata.org (Pages Function)
test/roundtrip.mjs                    Node reference implementation
test/helpers.ts                       shared Playwright helpers (waitForApp, toSection)
test/suites/11-20                     10 Playwright suites (84 tests)
test/generate-summary.mjs             CI evidence summary generator
docs/bridge.md                        design notes (Nostr ↔ centurymetadata bridge)
```

## Known limitations

- All data goes to the public `testapi.centurymetadata.org` with the all-zeros authtoken — **no production CM API exists yet** (upstream).
- `scanNetwork()` only probes slot 0 of each bundle directory; the grid is a sample, not a full network view.
- Single shared 8 MB bundle; O(N) slot scan.
- Post-quantum (`@noble/post-quantum`, ~9 KB) is bundled — it's the whole point.

## References

- [centurymetadata.org](https://centurymetadata.org) · [test API](https://testapi.centurymetadata.org)
- [FIPS 203](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.203.pdf) (ML-KEM) · [BIP-340](https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki) (Schnorr) · [NIP-06](https://github.com/nostr-protocol/nips/blob/master/06.md)

## Attribution

This project is a **browser-based learning client** that visualizes and explains the centurymetadata protocol.
It is not affiliated with the upstream project. The encode/decode logic in `src/lib/centurymetadata.ts` is a
TypeScript port of the [Python reference implementation](https://github.com/rustyrussell/centurymetadata/tree/master/python)
by [Rusty Russell](https://github.com/rustyrussell), adapted to use browser-compatible libraries:

| Primitive | Library | Python equivalent |
|---|---|---|
| secp256k1 ECDH + Schnorr | [`@noble/curves`](https://github.com/paulmillr/noble-curves) | `secp256k1` (libsecp256k1 bindings) |
| ML-KEM-1024 (FIPS 203) | [`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum) | `kyber_py.ml_kem` |
| SHA-256 | [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) | `hashlib` |
| BIP-32 / BIP-39 | [`@scure/bip32`](https://github.com/paulmillr/scure-bip32) / [`@scure/bip39`](https://github.com/paulmillr/scure-bip39) | custom (97 lines in `bip39.py`) |
| gzip | [`fflate`](https://github.com/101arrowz/fflate) | `gzip` (stdlib) |
| AES-256-CTR | [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) | `pycryptodome` |

Key patterns adapted from the Python reference:
- Record format and preamble — `python/centurymetadata/constants.py`
- TYPE/NAME/CONTENTS triples — `add-name-fields` branch (PR #9)
- 5 Bitcoin record types + validation — `python/centurymetadata/validate.py`
- BIP-32 derivation paths `/0'`, `/1'`, `/2'`, `/3'` — `python/centurymetadata/bip39.py`
- XOR-PIR two-server retrieval — `examples/EXAMPLES.md`
- gzip OS byte fix (offset 9 → `0xff`) — `python/centurymetadata/encode.py` line 25
