# Spec drift between this client and upstream centurymetadata

> **Audited**: 2026-08 against upstream's SPECIFICATION.md rewrite (AES-256-GCM
> replaces CTR, zlib replaces gzip, `DATA_LENGTH` 8192 → 16384, `GEN` folds
> into `AESKEY` and is little-endian, per-record UTF-8/NAME-length rules,
> "to-self" trust semantics)
> **Upstream spec canonical source**: https://github.com/rustyrussell/centurymetadata/blob/master/SPECIFICATION.md
> **Upstream reference implementation**: https://github.com/rustyrussell/centurymetadata/tree/master/python

This document tracks every place where this client intentionally diverges from
(or lags behind) the upstream spec, plus known deployment-lag issues with the
public test API at `https://testapi.centurymetadata.org`.

## Wire format

The on-the-wire byte layout in `src/lib/cm/constants.ts` (constants
`DATA_LENGTH`, `MLKEM_CT_LENGTH`, `PLAINTEXT_LENGTH`, `AES_LENGTH`,
`PREAMBLE`) is a **byte-exact mirror** of upstream
`python/centurymetadata/constants.py`. The PREAMBLE constant reproduces the
upstream text verbatim, including the two literal NUL delimiters (byte-for-byte
verified against upstream's SHA-256, not just visually).

Current byte layout: `PREAMBLE[1187] | SIG[64] | WRITER_PUBKEY[33] |
READER_ID[32] | GEN[8] | MLKEM_CT[1568] | AES[14679]` = 17571 bytes total on
the wire; `DATA_LENGTH` (the part stored server-side, preamble excluded) is
16384 bytes, which is what bundle slots are sized to (`SLOT_SIZE` in
`network.ts`).

`test/unit-tests.mjs → "PREAMBLE describes AES-256-GCM over a ZLIB stream"`
guards against future drift on the PREAMBLE text.

## Crypto pipeline

- **Compression**: zlib (RFC 1950), not gzip (RFC 1952) -- `crypto.ts`'s
  `zlibCompress`/`zlibDecompress`, backed by fflate's `zlibSync` and raw-DEFLATE
  `inflateSync` (with a manual 2-byte zlib-header check first; see that file's
  comments for why fflate's own `unzlibSync` doesn't work on our zero-padded
  buffers).
- **Encryption**: AES-256-GCM, not CTR -- authenticated, so tampering with the
  ciphertext (or claiming a different writer identity) is detected outright
  rather than silently producing garbage plaintext.
- **AESKEY**: `SHA256(ECDH_secret ∥ ML-KEM_secret ∥ GEN)` -- GEN is now folded
  into the key, so a ciphertext from one generation can never decrypt (or be
  replayed as) another.
- **GEN encoding**: little-endian (was implicitly big-endian pre-rewrite;
  upstream's rationale: "Intel won").
- **ECDH**: `SHA256(33-byte compressed shared point)` -- the *full* compressed
  point (0x02/0x03 prefix included), matching libsecp256k1's default `ecdh()`
  hash function. An earlier version of this client hashed only the 32-byte
  x-coordinate, which was already wrong under the old spec's (looser) prose
  and is now explicitly contradicted by SPECIFICATION.md's wording.

## Reader error handling ("to-self" trust)

`decodeSlot()` in `src/lib/cm/decode.ts` now mirrors upstream `decode.py`'s
full `CMDataError` taxonomy: whole-file (fatal) failures --
`BAD_WKEY`/`BAD_READER_ID`/`BAD_SIGNATURE`/`BAD_AES_TAG`/`BAD_ZLIB`/
`TRUNCATED_ZLIB`/`OVERSIZE_ZLIB` -- stop parsing entirely (`triples: []`); a
bad signature in particular is now **fatal**, matching the spec's "MUST fail
parsing" requirement (previously, under unauthenticated AES-CTR, a tampered
signature was detected but decryption proceeded anyway and returned
"garbage-but-present" plaintext -- see `CmSecurityDemos.svelte`'s tamper demo,
updated to reflect this).

Per-record failures (`TRUNCATED_TUPLE`/`OVERLENGTH_NAME`/`INVALID_UTF8`) are
non-fatal: a "to-self" record (`WRITER_PUBKEY` equals the reader's own derived
writer key) continues parsing past them; a not-to-self record may stop.

## Test API deployment lag (IMPORTANT)

As of this rewrite, whether `testapi.centurymetadata.org` matches this
client's spec version is **unknown until the operator redeploys** --
previously (as of 2026-07-22) it lagged the pre-2026-07-08
`TYPE\0NAME\0CONTENTS\0` preamble change; this client now additionally
requires the AES-256-GCM/zlib/16384-byte rewrite described above, which is a
second, later spec revision. Both `npm run test:roundtrip` and any manual
Playground use will fail with HTTP 400 "Incorrect preamble" against a
deployment that hasn't caught up.

**To verify crypto correctness end-to-end without depending on the public
deployment**, run a local server from the upstream python tree and point
this client at it:

```bash
cd centurymetadata/python && uv run python ../tools/localserver.py --test-mode
# in another shell:
TEST_API=http://localhost:8199 node test/roundtrip.mjs "action action action action action action action action action action action action"
```

(`--test-mode` restricts `authorize`/`update` to the known-keys scheme below,
so the mnemonic must be one of the 130 known words repeated 12×; `action` is
the first.) `tools/localserver.py` pre-populates the server with
`tools/gen_test_vectors.py`'s generated fixtures, so `GET
/api/v1/listbundles` returns real data immediately, not an empty bundle.

## BIP-32 derivation paths

This client derives the four BIP-32 children `0x44315441'/N'/{0',1',2',3}'`,
matching upstream `bip39.py derive_cm_keys`. The `N=0` derivation against the
standard "abandon×11 about" mnemonic reproduces the canonical reader_id
`46bdfb26fddb9e2962546ad2436e196feb29c0d873239a0954f1948e52bb44f3` -- see
`test/unit-tests.mjs → EXPECTED.READER_ID`. This layer is unaffected by the
GCM/zlib rewrite (only the record body format and crypto changed, not key
derivation).

## XOR-PIR target bit

`src/lib/cm/network.ts:fetchSlotPrivate` calls
`generateXorPirMasks(bundle.index)`. The 128-byte `fetchxor` bitmask selects
**bundles within a directory** (1024 bits, one per bundle), per upstream
README "Retrieving Entries". There is no upstream primitive for hiding which
**slot within a bundle** a client wants; clients always scan the recovered
16 MB bundle for their own `reader_id`.

## Accepted Bitcoin record types

`src/lib/cm/constants.ts:ACCEPTED_TYPES` lists the same five types as
upstream `validate.py ACCEPTED_TYPES`. The browser validators in
`src/components/CmRecordTypes.svelte` are deliberately more permissive than
upstream's `embit`-based validators (we cannot ship `embit` to the browser);
they check syntax only and label the deeper structural check as
"server-side".

## Test server "known keys" scheme

Upstream `known_keys.py` defines a closed set of 130 BIP-39 mnemonics that the
test server will accept when `TEST_MODE=1`: each is a single word repeated 12
times whose BIP-39 checksum happens to be valid. The first half (by wordlist
index) are "self-authored" -- the record's `WRITER_PUBKEY` must match that
same identity's own derived writer key; the second half are reserved for the
test server's pre-populated example data (generated by upstream
`tools/gen_test_vectors.py`, whose `manifest.json` labels each vector's reader
identity and, when the writer differs from the reader's own, its writer
identity too -- both as single mnemonic words, not raw hex).

This client **does** implement the scheme: `src/lib/cm/keys.ts` exports
`KNOWN_WORDS` (all 130, byte-exact against `known_words.txt`),
`knownWordMnemonic(word)`, `isKnownWord(word)`, and
`isSelfAuthoredWord(word)`, used by the Keys section's known-word picker. The
first few known words, by wordlist position, are `action`, `agent`, `aim`;
the last few are `word`, `world`, `yellow`.
