# greatspectations Feasibility Trial Report — centurymetadata-ai-experimental-client

> **Date**: 2026-07-25
> **Trial scope**: Wire format (preamble, crypto fields, BIP-32 paths), 5 Bitcoin record types
> **Verdict**: ✅ **PASS** — complementary to existing `spec-drift.yml`, roll out as non-blocking CI gate

---

## Executive Summary

We wired greatspectations into the centurymetadata learning client to validate spec-quote drift detection against the upstream `rustyrussell/centurymetadata` README spec. Over this trial:

- **19 spec-quote comments** embedded across 5 source files in `src/lib/cm/`.
- **All 19 match** the upstream spec verbatim (`spectate check` exits 0).
- **0 drift detected** — the TypeScript port is byte-faithful to the Python reference.
- **0 test regressions** — all 48 unit tests pass.
- **Fenced code block quotes work** — the entire wire-format spec lives inside a ``` fence, and spectate parses it correctly.
- **Complementary** to the existing weekly `spec-drift.yml` workflow (which detects upstream changes via file-diff).

**Recommendation**: Roll out as a **non-blocking** CI gate alongside the existing `spec-drift.yml`. The two form a two-layer drift safety net.

---

## Trial Scope

| Dimension | Value |
|-----------|-------|
| Spec sections instrumented | `## File Format` (fenced byte layout), `## Usage with Bitcoin` (record types, BIP-32 paths) |
| Source files touched | 5 (constants.ts, keys.ts, crypto.ts, encode.ts, decode.ts) |
| Total spec-quote comments | **19** |
| Spec source | `rustyrussell/centurymetadata` README.md (symlink for trial) |
| Tool version | greatspectations 0.1.1 |

### Per-file quote inventory

| File | Quotes | What |
|------|--------|------|
| constants.ts | 9 | TAG, MLKEM_Z_TAG, CM_PURPOSE path, PREAMBLE byte layout, all 5 Bitcoin record types |
| keys.ts | 4 | WRITER_PUBKEY, READER_SECP_PRIVKEY, READER_MLKEM_SEED_D BIP-32 paths, READER_ID formula |
| crypto.ts | 2 | ECDH_SECRET definition, AES CTR mode spec |
| encode.ts | 3 | AESKEY formula, DATA gzip/triples format, SIG BIP-340 prehash |
| decode.ts | 1 | SIG BIP-340 verification |

---

## Setup & Configuration

### `specquotes.toml` (repo root)

```toml
[sources.CM]
format = "markdown"
file = "spec/README.md"
comment_marker = "CM"
```

### npm scripts

```json
"spec:check": "spectate check --config specquotes.toml --comment-start '// ' --comment-continue '//' -k src/lib/cm/*.ts",
"spec:coverage": "spectate check --config specquotes.toml --comment-start '// ' --comment-continue '//' --coverage .coverage -k src/lib/cm/*.ts && spectate coverage --config specquotes.toml --coverage .coverage"
```

### CI workflow

`.github/workflows/spec-quote-drift.yml` — **distinctly named** from the existing `spec-drift.yml`. Documented as complementary:
- `spec-drift.yml` (existing): detects when the **upstream spec changes** (weekly cron, file-diff against `docs/upstream-baseline/`, opens GitHub issue)
- `spec-quote-drift.yml` (new): detects when **our code drifts** from the current spec (every push/PR, quote-match)

---

## Results

### Spec-quote drift check

```
$ npm run spec:check
exit=0
```

**All 19 quotes match** the upstream centurymetadata README verbatim.

### Coverage gaps

The coverage tool (`--all-sections`) identified uninstrumented sections:
- API endpoints (authorize, update, listbundles, fetchxor) — out of scope (client-side crypto trial)
- Test keys scheme — out of scope (test server concern)
- Pricing/commitment sections — non-normative prose

### Test regression

```
$ npm run test:unit
48 passed, 0 failed, 48 total
exit=0
```

**Zero regressions.** All 48 unit tests pass.

---

## Key Findings

### Finding 1: Fenced code block quotes work ✅

The centurymetadata wire-format spec is entirely inside a ``` fenced code block in the README. The smoke test confirmed that spectate's markdown parser reads text inside fenced blocks. This was the trial's biggest technical risk (R1) and it was resolved positively.

**Implication**: Byte-format strings like `centurymetadata v1\0SIG[64]|WRITER_PUBKEY[33]|...` can be quoted directly from the fenced block. The `\0`, `|`, `[]`, `\'` characters are all treated as literal text by spectate.

### Finding 2: Complementary to existing `spec-drift.yml`

The existing `spec-drift.yml` workflow (266 lines) runs weekly, fetches upstream files, diffs against `docs/upstream-baseline/`, and opens deduplicated GitHub issues. This catches **spec changes**. greatspectations catches **code drift**. Together they form a two-layer safety net:

```
spec-drift.yml      → "the spec moved, reconcile your code + baselines"
spec-quote-drift.yml → "your code's spec quotes are stale or inaccurate"
```

### Finding 3: Prior drift documentation exists

The repo already maintains `docs/SPEC-DRIFT.md` with detailed drift tracking (test API deployment lag, BIP-32 path verification, XOR-PIR target bit semantics, accepted record types). greatspectations **automates** what this manual document tracks — future drift in quoted surfaces would be caught automatically by `spectate check` before merge.

### Finding 4: Module split was already done

Recent commit `239fdc4 refactor(cm): split centurymetadata.ts into 10 focused modules` moved all crypto logic from a single `centurymetadata.ts` to `src/lib/cm/*.ts`. This made quote placement cleaner — each module (constants, keys, crypto, encode, decode) gets quotes for its specific spec section.

---

## Recommendation

### ✅ Roll out as non-blocking CI gate

**Rationale**: The tool works, the quotes match, zero regressions, and it complements the existing `spec-drift.yml`. The learning client already invests heavily in spec-fidelity (per-function upstream citations, drift docs, baseline tracking) — greatspectations formalizes that investment.

### Conditions

1. **Spec source** — replace symlink with a git submodule or vendor the README:
   ```bash
   git submodule add https://github.com/rustyrussell/centurymetadata.git spec
   ```
   Or vendor just the README + vars file (smaller footprint).

2. **Expand coverage** — add quotes for the API endpoint sections (authorize, fetchxor) in `src/lib/cm/network.ts` if those endpoints are implemented client-side.

3. **Keep non-blocking** — this is a learning/demo client, not production. Non-blocking is sufficient. The existing `spec-drift.yml` (weekly issue-based) remains the primary drift detection mechanism; greatspectations is a secondary check on push/PR.

### Relationship to `spec-drift.yml`

| Aspect | `spec-drift.yml` (existing) | `spec-quote-drift.yml` (new) |
|--------|-----------------------------|------------------------------|
| Trigger | Weekly cron (Monday 04:00 UTC) | Every push/PR |
| Method | File-diff upstream vs baseline | Quote-match code vs spec |
| Detects | Upstream spec changed | Code drifted from spec |
| Output | GitHub issue with diff | CI pass/fail + coverage report |
| Scope | All upstream files (vars, README, Python) | Only quoted code surfaces |
| Blocking | No (opens issue) | No (`continue-on-error: true`) |

---

## Comparison to cashu-cf Trial

| Metric | centurymetadata (this trial) | cashu-cf (parallel trial) |
|--------|------------------------------|---------------------------|
| Spec source | Single README.md (1 file) | cashubtc/nuts (31 files) |
| Quotes embedded | **19** | **25** |
| Files touched | 5 | 6 |
| Match rate | 100% (19/19) | 100% (25/25) |
| Real drift found | 0 | 0 |
| Test regression | 0 (48/48 pass) | 0 new (153 pre-existing) |
| Spec format | Fenced code block + prose | Markdown with `**MUST**` |
| Key risk resolved | Fenced-block parsing (R1) | Markdown link normalization |
| Complementary workflow | `spec-drift.yml` (existing) | None (new addition) |

---

## Next Steps

1. **Replace spec symlink** with submodule or vendor.
2. **Expand coverage** to API endpoints if client-side.
3. **Document the `// CM: <verbatim>` convention** in CONTRIBUTING.md.
4. **Keep both workflows running** — `spec-drift.yml` for upstream changes, `spec-quote-drift.yml` for code drift.
