# Upstream spec baseline

This directory holds byte-exact snapshots of the upstream centurymetadata files
that this project derives from. They are used by
[`.github/workflows/spec-drift.yml`](../../.github/workflows/spec-drift.yml) to
detect when the upstream spec changes.

**Source**: <https://github.com/rustyrussell/centurymetadata/tree/master>

**Snapshotted at**: master HEAD `7946c80` (2026-07-14) on 2026-07-22.

## Files

| File | Upstream path | Why we track it |
|---|---|---|
| `vars` | [`vars`](https://raw.githubusercontent.com/rustyrussell/centurymetadata/master/vars) | Spec source-of-truth (bash template that generates README.md). The PREAMBLE wire format, BIP-32 paths, and the 5 accepted TYPE strings are all defined here. |
| `README.md` | [`README.md`](https://raw.githubusercontent.com/rustyrussell/centurymetadata/master/README.md) | Generated from `vars`. Tracked for human review; `vars` is the actual source-of-truth. |
| `constants.py` | [`python/centurymetadata/constants.py`](https://raw.githubusercontent.com/rustyrussell/centurymetadata/master/python/centurymetadata/constants.py) | Canonical PREAMBLE bytes + `FULL_LENGTH`/`MLKEM_CT_LENGTH`/`DATA_LENGTH` constants + `bip340tag`. Our `src/lib/centurymetadata.ts:181-198` mirrors this byte-exact. |
| `encode.py` | [`python/centurymetadata/encode.py`](https://raw.githubusercontent.com/rustyrussell/centurymetadata/master/python/centurymetadata/encode.py) | Encoding pipeline (compress, ECDH, ML-KEM, AES, sign). Our `encodeRecord` mirrors `encode()`. |
| `decode.py` | [`python/centurymetadata/decode.py`](https://raw.githubusercontent.com/rustyrussell/centurymetadata/master/python/centurymetadata/decode.py) | Decoding pipeline (split_parts, check_sig, unaes, decompress). Our `decodeSlot` + `checkSignature` mirror this. |
| `validate.py` | [`python/centurymetadata/validate.py`](https://raw.githubusercontent.com/rustyrussell/centurymetadata/master/python/centurymetadata/validate.py) | The 5 accepted Bitcoin record types and their per-type CONTENTS validators. Our `ACCEPTED_TYPES` array mirrors `ACCEPTED_TYPES` here. |
| `bip39.py` | [`python/centurymetadata/bip39.py`](https://raw.githubusercontent.com/rustyrussell/centurymetadata/master/python/centurymetadata/bip39.py) | BIP-32 derivation paths `m/0x44315441'/N'/{0',1',2',3'}'`. Our `deriveCmKeys` mirrors `derive_cm_keys`. |
| `known_words.txt` | [`python/centurymetadata/server/known_words.txt`](https://raw.githubusercontent.com/rustyrussell/centurymetadata/master/python/centurymetadata/server/known_words.txt) | The ~130 BIP-39 words whose 12× repeated form has a valid checksum. Test server known-keys scheme. |

## When drift is detected

The weekly CI workflow fetches each file from `raw.githubusercontent.com` and
diffs against the snapshot here. If any file differs, CI opens (or comments on)
a GitHub issue labelled `spec-drift` containing the diff and a per-file change
summary.

After reconciling the drift in our code:

1. Update the baseline files in this directory to match the new upstream bytes
   (either `cp` manually or run the workflow with `refresh_baseline=true`).
2. Commit with `chore(spec): refresh upstream baseline @ <upstream-SHA>`.
3. Close the `spec-drift` issue.

## Why these files (and not others)

The upstream `server/` subtree beyond `known_words.txt` is implementation detail
of the test server; it does not affect wire-format compatibility. The upstream
`examples/` subtree documents usage but does not define the protocol. We track
only the files that define what bytes go on the wire.
