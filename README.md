# centurymetadata-ai-experimental-client

An interactive learning client for [centurymetadata](https://centurymetadata.org) — the post-quantum key-value store by [Rusty Russell](https://github.com/rustyrussell). **Experimental / proof-of-concept.** Not production, not affiliated with upstream.

> 🌐 **Live demo:** <https://centurymetadata-ai-experimental-client.pages.dev> · 📁 **Source:** <https://github.com/Amperstrand/centurymetadata-ai-experimental-client>

> Extracted from [blossomflare](https://github.com/Amperstrand/blossomflare). The git history of these files lives there; this repo starts a focused experimental client whose only goal is to **explore, learn, and demo** centurymetadata.

## What it shows

A single-page explorer walks through the whole system, end to end:

1. **The Big Picture** — one BIP-39 seed → two ecosystems (Nostr + centurymetadata)
2. **Keys & Identity** — live `m/0x44315441'/0'/{0',1',3'}` ("D1TA") derivation
3. **Record Anatomy** — the 8192-byte slot, byte-by-byte (137 cleartext / 8055 encrypted)
4. **Encryption** — animated 6-step hybrid pipeline (ECDH + ML-KEM-1024 → AES-256-CTR → BIP-340)
5. **Decryption** — the reverse pipeline, with live values
6. **Security Demos** — tamper-detection (sig invalidates) + wrong-reader confidentiality (reader_id mismatch)
7. **The Bundle** — 1024-slot XOR-masked grid + a network sample from the public test API
8. **Playground** — write a real encrypted record, fetch it back, watch it decrypt

Records use **hybrid cryptography**: classical ECDH (breakable by a future quantum computer) **plus** post-quantum ML-KEM-1024 (FIPS 203, lattice-based). An attacker must break **both** to decrypt.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173/#/centurymetadata
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
SERVER=<url> npm run test:e2e # Playwright suite (CM-01..CM-09)
```

## Layout

```
src/lib/centurymetadata.ts            crypto: keys, encode/decode, gzip, AES-CTR, network scan
src/components/CenturyMetadata.svelte 8-section explorer shell
src/components/Cm*.svelte              per-section sub-components
functions/cm/[[path]].ts              CORS proxy → testapi.centurymetadata.org (Pages Function)
test/roundtrip.mjs                    Node reference implementation
test/suites/11-centurymetadata.spec.ts Playwright suite
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
