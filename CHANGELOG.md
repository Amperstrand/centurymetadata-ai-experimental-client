# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Upstream-spec references point to [rustyrussell/centurymetadata](https://github.com/rustyrussell/centurymetadata);
see [docs/SPEC-DRIFT.md](docs/SPEC-DRIFT.md) for the per-surface drift inventory.

## [Unreleased]

### Added
- **Known-keys scheme support** — `KNOWN_WORDS` (130 BIP-39 words from upstream
  `known_words.txt`), `knownWordMnemonic()`, `isKnownWord()`, `isSelfAuthoredWord()`
  helpers in `src/lib/centurymetadata.ts`. `RECORD_EXAMPLES` provides valid
  TYPE/NAME/CONTENTS for all 5 accepted Bitcoin record types.
- **Known-word picker UI** in `CenturyMetadata.svelte` — dropdown listing all 130
  known words with self-authored/example-data badge. Selecting a word fills the
  mnemonic and auto-derives keys.
- **TYPE/NAME/CONTENTS Playground** — `CmPlayground.svelte` upgraded from
  title/content inputs to TYPE dropdown + NAME + CONTENTS, auto-filled from
  `RECORD_EXAMPLES`. Encode now uses compliant Bitcoin TYPEs.
- **9 upstream test vector tests** in `test/unit-tests.mjs` (47 total) — verifies
  ML-KEM Z tag, BIP-340 TAG, ML-KEM seed Z derivation, and full N=2147483647
  extreme-slot derivation chain against upstream `test_vectors.json`.
- **5 known-keys tests** — KNOWN_WORDS count (130), known words present,
  mnemonic builder, self-authored split, RECORD_EXAMPLES coverage.
- Weekly CI workflow `.github/workflows/spec-drift.yml` — fetches 8 upstream
  files, diffs against baselines, opens deduplicated `spec-drift` issue.
- `docs/upstream-baseline/` — byte-exact snapshots of upstream master HEAD.
- `CHANGELOG.md`, `LICENSE`, `NOTICE`, `docs/SPEC-DRIFT.md`.

### Fixed
- **E2E `networkidle` timeout** — replaced 16 `waitUntil: 'networkidle'` with
  `'domcontentloaded'` across 5 test suites (was causing all 100 E2E tests to
  fail with 15s navigation timeout).
- **E2E assertion mismatches** — CM-09, CM-51, CM-65 updated for the
  TYPE/NAME/CONTENTS Playground upgrade and BrowserGotchas demo data change.
- **PREAMBLE constant** — `TITLE\0CONTENTS\0` → `TYPE\0NAME\0CONTENTS\0` matching
  upstream commit `c750c08` (preamble 1046→1051 bytes, record 9238→9243).
- **XOR-PIR target bit** — `fetchSlotPrivate` now uses `bundle.index` (was
  `globalBit % 1024` which collapsed to `slotIdx`).
- **21 `// Upstream provenance:` comments** citing specific upstream file:line.

## [0.2.0] — 2026-07-22

Spec-conformance + attribution pass against upstream master HEAD `7946c80`
(2026-07-14). Full drift inventory in [docs/SPEC-DRIFT.md](docs/SPEC-DRIFT.md).

### Added
- `LICENSE` — MIT, with a third-party-notices section crediting
  **Rusty Russell (Copyright © 2021)** and enumerating every upstream file this
  project derives from.
- `NOTICE` — project-level attribution and experimental-status disclaimer.
- `docs/SPEC-DRIFT.md` — formal record of (a) where this client intentionally
  diverges from upstream master and (b) the deployment lag of the public test
  API at `testapi.centurymetadata.org`.
- Per-function `// Upstream provenance:` comments throughout
  `src/lib/centurymetadata.ts` and `test/roundtrip.mjs`, citing specific
  upstream file:line for `taggedHash`, `computeEcdh`, `gzipCompress`,
  `aesCtrEncrypt`, `PREAMBLE`, `deriveCmKeys`, `encodeRecord`, `decodeSlot`,
  `generateXorPirMasks`, `fetchSlotPrivate`, `checkSignature`.
- Four TDD drift-guard tests in `test/unit-tests.mjs` (33 total, all green)
  that read our own source/docs as text and assert the upstream-correct
  contract is present, so future drift is caught at CI time.

### Changed
- **PREAMBLE constant** in `src/lib/centurymetadata.ts:181-203` and
  `test/roundtrip.mjs:18-41` now mirrors upstream `constants.py:1-19` byte-exact
  — `DATA: gzip([TYPE\0NAME\0CONTENTS\0]+)…` form, matching upstream commit
  [`c750c08`](https://github.com/rustyrussell/centurymetadata/commit/c750c08)
  (2026-07-08). The encoder already produced triples; only the text constant
  lagged. Preamble length is now 1051 bytes (was 1046), full record 9243 bytes
  (was 9238). Every byte-count comment in the project was updated to match.
- **`fetchSlotPrivate` XOR-PIR target bit** in `src/lib/centurymetadata.ts`
  now uses `bundle.index` (the bundle's position in its directory) instead of
  the obsolete `globalBit = bundle.index * 1024 + slotIdx` then `% 1024`
  expression, which collapsed to `slotIdx` and only worked by accident when
  the directory contained a single bundle. The 128-byte `fetchxor` bitmask
  selects BUNDLES within a DIRECTORY (1024 bits per upstream README
  "Retrieving Entries"); there is no slot-level PIR primitive.
- **`CmBundleSystem.svelte`** rewritten the "Privacy in numbers" explainer
  to use upstream terminology: the bitmask selects bundles in a directory,
  not slots within a bundle. A single-bit mask returns one raw 8 MB bundle
  (1024 slots), which the client then scans for `reader_id`. Also replaced
  the stale `GET /api/v1/fetchdepth` reference (removed upstream in commit
  [`5358225`](https://github.com/rustyrussell/centurymetadata/commit/5358225),
  2026-07-07) with a `listbundles + fetchxor` description.
- **`CmRecordTypes.svelte`** added `spscan` to the valid BIP-329 label types,
  matching upstream `validate.py:_LABEL_TYPES`.
- **`docs/bridge.md`** end-to-end accuracy pass: encryption/decryption
  pipelines now cite upstream file:line; `title\0content\0` →
  `type\0name\0contents\0`; AUTHTOKEN note cites `server.py:240-243`;
  references section corrected (the previous BIP-340 URL pointed at BIP-34)
  and expanded with BIP-39, BIP-380, BIP-329, NIP-19; removed
  BlossomFlare-specific framing from the Use Cases section.
- **README.md** attribution section expanded with a per-pattern table citing
  the specific upstream file:line each ported section derives from, plus the
  key commit SHAs (`c750c08`, `63baef2`, `5358225`, `e856197`, `56f6462`,
  `633b038`, `91618eb`/`555b832`/`0a0c46e`/`1c00350`/`c5edc0e`). Added
  "Spec drift" section linking to `docs/SPEC-DRIFT.md`.

### Known issues
- `npm run test:roundtrip` against the public test API at
  `testapi.centurymetadata.org` currently fails with HTTP 400
  "Incorrect preamble" because that deployment lags upstream master
  (verified live 2026-07-22: `AUTHORIZE 200 OK`, `UPDATE 400`). This is
  correct master-HEAD pinning behaviour; the round-trip will start passing
  again the moment the upstream operator redeploys at HEAD. The 30
  crypto-level unit tests pass independently and verify that our key
  derivation, ECDH, ML-KEM, AES-CTR, gzip, and BIP-340 Schnorr are all
  byte-correct.

## [0.1.0] — 2026-07-08

Initial extraction from
[blossomflare](https://github.com/Amperstrand/blossomflare) as a focused
experimental learning client. 14 interactive Svelte sections covering the
centurymetadata protocol end-to-end: BIP-32/39 key derivation, hybrid
encryption (ECDH + ML-KEM-1024), record anatomy, gzip OS byte gotcha,
XOR-PIR retrieval, network explorer, and a live playground.
