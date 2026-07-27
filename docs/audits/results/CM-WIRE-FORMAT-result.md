# centurymetadata Wire Format Audit — Result

> **Auditor**: opencode semantic spec audit
> **Date**: 2026-07-27
> **Spec**: `spec/README.md` (upstream rustyrussell/centurymetadata)
> **TS impl**: `src/lib/cm/` (constants.ts, keys.ts, crypto.ts, encode.ts, decode.ts, utils.ts)
> **Python ref**: `spec/python/centurymetadata/` (constants.py, encode.py, decode.py, bip39.py)
> **Test vectors**: `spec/test_vectors.json` (3 vectors: N=0 abandon, N=1 abandon, N=2147483647 zoo)

---

## Executive Summary

| # | Field | Spec | Status | Detail |
|---|-------|------|--------|--------|
| 1 | PREAMBLE | `centurymetadata v1\0` + body text (1051 bytes) | ✅ | Byte-exact match with `constants.py` |
| 2 | SIG | BIP-340 over `TAG\|TAG\|content` | ✅ | Tagged hash construction correct |
| 3 | WRITER_PUBKEY | BIP-32 `0x44315441'/N'/0'`, compressed 33B | ✅ | Path + compression correct |
| 4 | READER_ID | `SHA256(secp_pub\|mlkem_pub)` | ✅ | Order + compression verified against test vectors |
| 5 | GEN | 8-byte big-endian | ✅ | `int64ToBytesBE` matches `to_bytes(8,"big")` |
| 6 | MLKEM_CT | ML-KEM-1024 (FIPS 203) ciphertext, 1568B | ✅ | `@noble/post-quantum` encapsulate correct |
| 7 | AES | AES-256-CTR nonce=0 counter=0 | ✅ | 16-byte zero IV matches `nonce=bytes(8)` |
| 8 | DATA | `gzip([TYPE\0NAME\0CONTENTS\0]+)` padded to 6487 | ✅ | gzip OS=0xff, NUL triples, zero-pad correct |
| 9 | **ECDH_SECRET** | `SHA256(compressed(shared_point))` | **❌** | **TS computes `SHA256(x_only)` — hashes 32 bytes, Python hashes 33 bytes** |

**Overall verdict**: **FAIL** — 1 critical field mismatch breaks cross-implementation
interoperability. The TS implementation is internally consistent (TS→TS roundtrip works)
but cannot interoperate with the Python reference or the live test server.

**Root cause**: `crypto.ts:12` hashes `shared.subarray(1, 33)` (32-byte x-coordinate)
instead of the full 33-byte compressed point. The `secp256k1-py >= 0.14.0` `ecdh()`
method returns `SHA256(compressed_point)`, confirmed by runtime test and the upstream
`test_vectors.json`.

---

## Audit Method

Each field was verified by:
1. Reading the spec text from `spec/README.md`
2. Comparing the TS implementation against the Python reference line-by-line
3. Cross-checking against `spec/test_vectors.json` (3 vectors with full intermediate values)
4. Runtime verification of the ECDH discrepancy using the installed `secp256k1-py 0.14.0`

**Python dependencies** (`spec/python/requirements.txt`, `pyproject.toml`):
- `secp256k1 >= 0.14.0` — critical: this version's `ecdh()` returns `SHA256(compressed_point)`
- `pycryptodomex >= 3.6` — AES-256-CTR
- `kyber-py >= 0.5.0` — ML-KEM-1024

---

## Field-by-Field Audit

### Field: PREAMBLE
**Spec**: `spec/README.md` lines 20-39 — `centurymetadata v1\0SIG[64]|WRITER_PUBKEY[33]|READER_ID[32]|GEN[8]|MLKEM_CT[1568]|AES[6487]` followed by 17 definition lines ending with `...to 6487\0`
**Status**: ✅
**TS impl**: `constants.ts:39-61` — IIFE constructs `verheader = TextEncoder.encode('centurymetadata v1\0')` (19 bytes) + body string. Every line matches Python `constants.py:2-19` character-for-character.
**Python ref**: `constants.py:1-19` — `verheader = b"centurymetadata v1\0"` + triple-quoted body. `bip340tag = verheader[:-1]` = `b"centurymetadata v1"` (18 chars, no trailing NUL).
**Byte match?**: ✅ Verified line-by-line. Key escape sequences:
- Python `\'` in `b"""..."""` → literal `'` (TS uses `'...'/N'/0'` in string literal) ✅
- Python `\\0` → literal `\0` text (TS uses `\\0` in template string) ✅
- Python `\0` → NUL byte 0x00 (TS uses `\0` at end of `6487\0`) ✅
- Python triple-quote ends after NUL — no trailing newline (TS string ends at `\0'` — no trailing newline) ✅
- Total: 19 (verheader) + 1032 (body) = 1051 bytes in both implementations ✅

---

### Field: SIG (BIP-340 Schnorr signature)
**Spec**: `SIG: BIP-340 SHA256(TAG|TAG|WRITER_PUBKEY|READER_ID|GEN|MLKEM_CT|AES)` where `TAG: SHA256("centurymetadata v1"[18])`
**Status**: ✅
**TS impl**: `encode.ts:70-71` — `const prehash = taggedHash(BIP340_TAG, contentBytes); const sig = schnorr.sign(prehash, keys.writerPrivKey);`
  - `taggedHash` (`utils.ts:13-17`): `SHA256(SHA256(tag) || SHA256(tag) || msg)` — standard BIP-340 tagged hash ✅
  - `BIP340_TAG = 'centurymetadata v1'` (`constants.ts:9`) — 18 chars, matches Python `bip340tag = verheader[:-1]` ✅
  - `contentBytes` = `WRITER_PUBKEY || READER_ID || GEN || MLKEM_CT || AES` (`encode.ts:61-67`) — field order matches spec ✅
  - `schnorr.sign()` from `@noble/curves` uses standard BIP-340 challenge tag `"BIP0340/challenge"` ✅
**Python ref**: `encode.py:97-98` — `writer.schnorr_sign(cont, bip340tag)`. The `secp256k1-py` `schnorr_sign(msg, tag)` internally computes `SHA256(SHA256(tag) || SHA256(tag) || msg)` then signs with libsecp256k1's standard BIP-340.
**Byte match?**: ✅ Both compute the same challenge hash structure:
- Message hash = `SHA256(TAG || TAG || content)` where TAG = `SHA256("centurymetadata v1")`
- Challenge = `SHA256("BIP0340/challenge" || "BIP0340/challenge" || R_x || P_x || message_hash)`
- Tag hash verified against test vector: `SHA256("centurymetadata v1") = 420bad4c...461034fc` ✅
**Note**: Signatures are non-deterministic (both TS and Python use random `aux_rand` by default). This is spec-compliant — only verification correctness matters. Test vector SIG uses `aux_rand=0x00*32` for determinism.

---

### Field: WRITER_PUBKEY
**Spec**: `WRITER_PUBKEY: BIP-32 0x44315441\'/N\'/0\'` — compressed secp256k1 public key, 33 bytes
**Status**: ✅
**TS impl**: `keys.ts:34,63` — `coin.deriveChild((0x80000000 + 0) >>> 0)` then `secp256k1.getPublicKey(writerPrivKey, true)` (compressed)
**Python ref**: `bip39.py:93` — `_bip32_child_h(k, c, _H(0))` where `_H(0) = 0 | 0x80000000`
**Byte match?**: ✅ Verified against test vector:
- N=0: `9355d4cd...e828c090` → `02f55335969a3f0e437e0f60de88b1ce68e91463d1eda9e486ad33a45081c3502c` ✅
- N=1: `c5603070...b2b61057` → `02f279bb...9577c0a4` ✅
- N=2147483647: `289858d5...6530f56` → `02e96336...9f4688` ✅

---

### Field: READER_ID
**Spec**: `READER_ID: SHA256(READER_SECP_PUBKEY|READER_MLKEM_PUBKEY)` — compressed secp pubkey (33B) concatenated with ML-KEM pubkey (1568B)
**Status**: ✅
**TS impl**: `keys.ts:67` — `const readerId = sha256(concatBytes(readerSecpPubKey, mlkemPublicKey))` where `readerSecpPubKey = secp256k1.getPublicKey(readerSecpPrivKey, true)` (compressed 33B)
**Python ref**: `encode.py:81-83` — `hashlib.sha256(reader_secp_pubkey.serialize() + reader_mlkem_pubkey).digest()` where `.serialize()` returns compressed 33B
**Byte match?**: ✅ Concatenation order is `secp_pubkey || mlkem_pubkey` in both. Verified against test vectors:
- N=0: `46bdfb26fddb9e2962546ad2436e196feb29c0d873239a0954f1948e52bb44f3` ✅
- N=1: `5871d8cff6a8bb1170d3c52e12cd54118ffa007eeafc89d38c71832e0b834d0c` ✅
- N=2147483647: `2cf6ab97beb2509a65e6b86cfa07305f9d5282440e03e601e6b967aeb9dc2068` ✅

---

### Field: GEN (generation counter)
**Spec**: 8-byte big-endian integer
**Status**: ✅
**TS impl**: `utils.ts:20-28` — `int64ToBytesBE(value: bigint)` produces 8-byte big-endian
**Python ref**: `encode.py:94` — `gen.to_bytes(8, "big")`
**Byte match?**: ✅ Same encoding. Test vector GEN=0 produces `0x00*8`.

---

### Field: MLKEM_CT (ML-KEM-1024 ciphertext)
**Spec**: `MLKEM_CT: ML-KEM-1024 (FIPS 203) ciphertext encapsulated to reader's ML-KEM key` — 1568 bytes
**Status**: ✅
**TS impl**: `keys.ts:49-54` — seed = `concatBytes(d, z)` where `d = readerMlkemSeedD` (BIP-32 /3' privkey) and `z = taggedHash(MLKEM_Z_TAG, d)`. Then `ml_kem1024.keygen(mlkemSeed)` → 64-byte d‖z seed consumed in FIPS 203 order.
**Python ref**: `encode.py:47-73` — `d = bip32_privkey; z = bip340_tagged_hash("centurymetadata v1 mlkem-z", d)`. Seeded via `iter([d, z])` → `random_bytes(32)` returns d first, z second.
**Byte match?**: ✅ Seed construction identical. ML-KEM keygen verified against test vectors:
- `MLKEM_Z_TAG = SHA256("centurymetadata v1 mlkem-z") = 2f9798126f0dc0361bc7cc7a5baced081394a0cf0f24184731c23349a0b402f2` ✅
- N=0 seed_z = `3013b591e0ea9be09e908bc8c24300b254082450f0f852be680e42ff19330725` ✅
- N=1 seed_z = `d231de9cd13b8903d2d83f8c3a6b0a8329a4835e011378b812ef5dc42857c072` ✅
- READER_ID values match (which transitively verifies ML-KEM pubkey derivation) ✅
- `MLKEM_SECRET` decapsulation roundtrip verified in unit tests ✅
- Ciphertext length = 1568 bytes ✅

---

### Field: AES (AES-256-CTR ciphertext)
**Spec**: `AES: CTR mode (starting 0, nonce 0) using AESKEY of DATA` — 6487 bytes
**Status**: ✅
**TS impl**: `crypto.ts:43-51` — Web Crypto `AES-CTR` with `counter: new Uint8Array(16)` (16-byte zero IV), `length: 128` (full-block counter). Equivalent to nonce=0x00*8, counter=0.
**Python ref**: `encode.py:32-38` — `AES.new(key=aeskey, mode=AES.MODE_CTR, nonce=bytes(8))` — 8-byte zero nonce, 8-byte counter starting at 0.
**Byte match?**: ✅ Both produce identical keystream for data ≤ 2^64 blocks (6487 bytes = 406 blocks, well within range). Initial IV = `0x00*16` in both. Counter increments identically for the low-order bytes.
**AESKEY construction**: `SHA256(ECDH_SECRET || MLKEM_SECRET)` — structurally correct in both (`encode.ts:42`, `encode.py:86-88`). However, ECDH_SECRET value differs (see below).

---

### Field: DATA (gzip-compressed triples)
**Spec**: `DATA: gzip([TYPE\0NAME\0CONTENTS\0]+), padded with 0 bytes to 6487\0`
**Status**: ✅
**TS impl**: `encode.ts:44-55` — serializes `[type, \0, name, \0, contents, \0]` per triple, concatenates, gzip-compresses with `gzipCompress`, zero-pads to `DATA_LENGTH`.
**Python ref**: `encode.py:10-29` — serializes `type + bytes(1) + name + bytes(1) + contents + bytes(1)` per triple, concatenates, `gzip.compress(raw, mtime=0)`, patches OS byte to 0xff, `.ljust(DATA_LENGTH, bytes(1))`.
**Byte match?**: ✅ Structure matches:
- NUL-separated UTF-8 triples: `TYPE\0NAME\0CONTENTS\0` per record ✅
- gzip compression level 9 (Python default for `gzip.compress`; TS explicit `{ level: 9 }`) ✅
- MTIME = 0: Python via `mtime=0` parameter; TS via explicit `result[4..7] = 0` ✅
- OS byte = 0xff: Python via `ret[:9] + b'\xff' + ret[10:]`; TS via `result[9] = 0xff` ✅
- Zero-padding to 6487: Python `.ljust(DATA_LENGTH, bytes(1))` where `bytes(1) = b'\x00'`; TS `new Uint8Array(DATA_LENGTH)` (zero-initialized) ✅
- Overflow check: Python raises `ValueError`; TS `Uint8Array.set()` throws `RangeError` — functionally equivalent ✅
**Note**: The gzip *compressed bytes* may differ between Python's zlib and fflate due to DEFLATE implementation differences. This does not affect spec compliance — both produce valid gzip streams that decompress to identical data. The spec does not mandate byte-identical compressed output across implementations.

---

### Field: ECDH_SECRET
**Spec**: `ECDH_SECRET: EC Diffie-Hellman of WRITER_PUBKEY and READER_SECP_PRIVKEY`
**Test vectors**: `test_vectors.json` line 115: `"SHA256(compressed(WRITER_SECP_PRIVKEY * READER_SECP_PUBKEY)) via secp256k1_ecdh"`
**Status**: ❌ **CRITICAL MISMATCH**
**TS impl**: `crypto.ts:10-13`:
```typescript
export function computeEcdh(myPrivKey: Uint8Array, theirPubKeyCompressed: Uint8Array): Uint8Array {
  const shared = secp256k1.getSharedSecret(myPrivKey, theirPubKeyCompressed);
  return sha256(shared.subarray(1, 33));  // ← hashes 32-byte x-coordinate ONLY
}
```
`@noble/curves` `getSharedSecret()` returns uncompressed point `[0x04, x(32), y(32)]` (65 bytes).
`shared.subarray(1, 33)` extracts bytes [1..33) = x-coordinate (32 bytes).
Result: **`SHA256(x_coordinate)` — 32-byte input**.

**Python ref**: `encode.py:76-78`:
```python
def get_ecdh_secret(privkey: PrivateKey, pubkey: PublicKey) -> bytes:
    return pubkey.ecdh(privkey.private_key)
```
`secp256k1-py >= 0.14.0` `ecdh()` returns **`SHA256(compressed_point)` — 33-byte input** (`[0x02|0x03, x(32)]`).

**Runtime verification** (against `secp256k1-py 0.14.0` + test vector N=0):
```
Python ecdh() result:      47855ae81cb587b9f70c1a26902aeb373e2ba4fd12790865fa6250a95f14810d
SHA256(compressed 33B):    47855ae81cb587b9f70c1a26902aeb373e2ba4fd12790865fa6250a95f14810d  ← MATCH
SHA256(x-only 32B):        38273a07030aec960e599161cf75af3723d99034f6a4998edf9d19a22609931c  ← TS value
```

**Downstream impact**:
```
Expected AESKEY (test vector):     48db03bb3e780f6521a286cfb52dff5ff8f00aaabf96289177e79204ff38ef42
Python ECDH → AESKEY:              48db03bb3e780f6521a286cfb52dff5ff8f00aaabf96289177e79204ff38ef42  ← MATCH
TS ECDH → AESKEY:                  3c18f7ed9f6726b2074aea7e2f0cf722d0a0241cd0d7bd6e8266824494cd3c1e  ← MISMATCH
```

**Impact**: Records encoded by the TS implementation **cannot** be decoded by the Python reference, and vice versa. The AES decryption will produce garbage, gzip decompression will fail, and the test server will reject the record. TS→TS roundtrip works because both sides use the same (incorrect) ECDH.

**Root cause**: The TS comment (`crypto.ts:8`) states "libsecp256k1 ECDH default hashfn = SHA256(x-coordinate of the shared point)". This is incorrect for `secp256k1-py >= 0.14.0`, which returns `SHA256(compressed_point)` (33 bytes including prefix byte 0x02/0x03).

**Fix** (not applied — audit only): In `crypto.ts:12`, change:
```typescript
return sha256(shared.subarray(1, 33));
```
to:
```typescript
const point = secp256k1.Point.fromHex(shared);
return sha256(point.toBytes(true));  // 33-byte compressed: [0x02|0x03, x(32)]
```

---

## BIP-32 Paths (cross-cutting)

**Spec**: `m/0x44315441'/N'/{0',1',2',3'}'` — hardened derivation at every level
**Status**: ✅

| Path component | Python (`bip39.py`) | TS (`keys.ts`) | Match |
|---|---|---|---|
| Purpose `0x44315441'` | `_H(CM_PURPOSE)` = `0x44315441 \| 0x80000000` | `(0x80000000 + CM_PURPOSE) >>> 0` | ✅ |
| Index N | `_H(n)` | `(0x80000000 + n) >>> 0` | ✅ |
| Writer `/0'` | `_H(0)` | `(0x80000000 + 0) >>> 0` | ✅ |
| Reader secp `/1'` | `_H(1)` | `(0x80000000 + 1) >>> 0` | ✅ |
| Writer ML-KEM `/2'` | `_H(2)` | `(0x80000000 + 2) >>> 0` | ✅ |
| Reader ML-KEM `/3'` | `_H(3)` | `(0x80000000 + 3) >>> 0` | ✅ |

BIP-32 hardened derivation algorithm matches: Python implements HMAC-SHA512 from scratch (`bip39.py:71-76`); TS uses `@scure/bip32` `HDKey.deriveChild()`. Both implement standard BIP-32 (`data = 0x00 || privkey || index; digest = HMAC-SHA512(chain, data); ki = (IL + parent_key) mod n`). All 3 test vectors match. ✅

---

## Accepted Bitcoin Record Types

**Spec**: `spec/README.md` lines 64-68 — exactly 5 types
**Status**: ✅

| # | Spec TYPE string | TS `ACCEPTED_TYPES` (`constants.ts:20-31`) | Match |
|---|---|---|---|
| 1 | `bitcoin psbt` | `'bitcoin psbt'` | ✅ |
| 2 | `bitcoin transaction` | `'bitcoin transaction'` | ✅ |
| 3 | `bitcoin miniscript` | `'bitcoin miniscript'` | ✅ |
| 4 | `bitcoin output script descriptor` | `'bitcoin output script descriptor'` | ✅ |
| 5 | `bitcoin wallet labels` | `'bitcoin wallet labels'` | ✅ |

Exact string match for all 5 types. No extra or missing types. ✅

---

## Slot Structure (offsets)

**Spec**: `SIG[64]|WRITER_PUBKEY[33]|READER_ID[32]|GEN[8]|MLKEM_CT[1568]|AES[6487]`
**Status**: ✅

| Field | Offset | Length | TS decode (`decode.ts`) | Python decode (`decode.py`) | Match |
|---|---|---|---|---|---|
| SIG | 0 | 64 | `subarray(0, 64)` | `[0:64]` | ✅ |
| WRITER_PUBKEY | 64 | 33 | `subarray(64, 97)` | `[64:64+33]` | ✅ |
| READER_ID | 97 | 32 | `subarray(97, 129)`* | `[64+33:64+33+32]` | ✅ |
| GEN | 129 | 8 | `subarray(129, 137)` | `[gen_off:gen_off+8]` | ✅ |
| MLKEM_CT | 137 | 1568 | `subarray(137, 1705)` | `[mlkem_ct_off:mlkem_ct_off+1568]` | ✅ |
| AES | 1705 | 6487 | `subarray(1705)` | `[mlkem_ct_off+1568:]` | ✅ |
| **Total** | | **8192** | | | ✅ |

*READER_ID offset not explicitly sliced in TS decode (uses `keys.readerId` for comparison instead).

Content bytes for SIG verification: `slot[64:]` = `WRITER_PUBKEY || READER_ID || GEN || MLKEM_CT || AES` — identical field layout in both implementations. ✅

---

## Decode Pipeline

**Spec**: Inverse of encode: verify sig → ECDH → ML-KEM decaps → AES decrypt → decompress → parse triples
**Status**: ✅ (structure) / ❌ (ECDH — same bug as encode)

TS `decode.ts:29-86`:
1. Split slot into SIG, WRITER_PUBKEY, GEN, MLKEM_CT, AES ✅
2. Compute `taggedHash(BIP340_TAG, contentBytes)` and verify with `schnorr.verify()` ✅
3. ECDH: `computeEcdh(keys.readerSecpPrivKey, slotWriterPub)` — ❌ same bug (SHA256 of x-only)
4. ML-KEM decapsulate: `ml_kem1024.decapsulate(slotMlkemCt, keys.mlkemSecretKey)` ✅
5. AESKEY: `SHA256(ECDH || MLKEM_SECRET)` ✅ (structure correct, ECDH value wrong)
6. AES decrypt: `aesCtrDecrypt(decodeAesKey, slotEncrypted)` ✅
7. gzip decompress: `gzipDecompress(decryptedPadded)` ✅ (manual RFC-1952 header parsing to handle fflate's padded-data bug)
8. Parse triples: `split('\0')`, pop trailing empty, group by 3 ✅

Python `decode.py:76-93`:
1. Verify `startswith(preamble)` ✅
2. Check `len == FULL_LENGTH` ✅
3. `check_sig(after_preamble)` ✅
4. ECDH, ML-KEM decaps, AESKEY, unaes, decompress ✅

**Legacy parsing note**: TS `decode.ts:61-64` has a fallback for 2-field pairs (old TITLE\0CONTENTS\0 format). Python `decode.py:16` rejects pairs (`len(fields) % 3 != 1 → None`). This is extra robustness in TS, not a spec violation — it only triggers for pre-2026-07-08 records.

---

## Constants Cross-Check

| Constant | Python value | TS value | Match |
|---|---|---|---|
| `FULL_LENGTH` | `8192` (`constants.py:21`) | `8192` (`constants.ts:5`) | ✅ |
| `MLKEM_CT_LENGTH` | `1568` (`constants.py:22`) | `1568` (`constants.ts:6`) | ✅ |
| `DATA_LENGTH` | `8192 - (64+33+32+8+1568) = 6487` (`constants.py:23`) | `8192 - (64+33+32+8+1568) = 6487` (`constants.ts:7`) | ✅ |
| `CM_PURPOSE` | `0x44315441` (`bip39.py:8`) | `0x44315441` (`constants.ts:13`) | ✅ |
| `bip340tag` | `verheader[:-1]` = `b"centurymetadata v1"` (18B) | `'centurymetadata v1'` (18 chars) (`constants.ts:9`) | ✅ |
| `MLKEM_Z_TAG` | `"centurymetadata v1 mlkem-z"` (26 chars) | `'centurymetadata v1 mlkem-z'` (26 chars) (`constants.ts:11`) | ✅ |
| PREAMBLE length | 1051 bytes (19 + 1032) | 1051 bytes | ✅ |
| Record total | `len(preamble) + FULL_LENGTH = 9243` | 1051 + 8192 = 9243 | ✅ |

Tag hash verification (from `test_vectors.json`):
- `SHA256("centurymetadata v1") = 420bad4c7832ad7977a3cf553d7e10360a4561ecfea1222d62e946be461034fc` ✅
- `SHA256("centurymetadata v1 mlkem-z") = 2f9798126f0dc0361bc7cc7a5baced081394a0cf0f24184731c23349a0b402f2` ✅

---

## Known Test Keys (informational)

**Spec**: `spec/README.md` lines 104-124 — 130 words whose 12× repeated BIP-39 mnemonic has a valid checksum
**Status**: ✅

TS `keys.ts:90-108` contains all 130 `KNOWN_WORDS`, ordered by wordlist position, matching the upstream `known_words.txt`. The self-authored / example-data split (first half / second half) is correct (`keys.ts:124-128`, matches `known_keys.py:50-55`). Verified by unit test asserting 130 entries + presence of `action`, `agent`, `aim` (first) and `word`, `world`, `yellow` (last).

---

## Summary of Findings

### ✅ Compliant (8 of 9 wire format fields)

The TS implementation correctly implements:
1. **PREAMBLE** — byte-exact 1051-byte text header
2. **SIG** — BIP-340 Schnorr over centurymetadata-tagged hash of content
3. **WRITER_PUBKEY** — BIP-32 derived, compressed 33-byte secp256k1 key
4. **READER_ID** — `SHA256(compressed_secp_pub || mlkem_pub)`
5. **GEN** — 8-byte big-endian counter
6. **MLKEM_CT** — FIPS 203 ML-KEM-1024 ciphertext, deterministic keygen from d‖z
7. **AES** — AES-256-CTR with 16-byte zero IV
8. **DATA** — gzip-compressed `TYPE\0NAME\0CONTENTS\0` triples, OS=0xff, zero-padded

All BIP-32 paths, constants, tag strings, and field offsets match the Python reference and test vectors exactly.

### ❌ Critical Non-Compliance (1 field)

**ECDH_SECRET** (`crypto.ts:10-13`): The TS implementation computes `SHA256(x_coordinate)` (32-byte input), but the Python reference (`secp256k1-py >= 0.14.0`) returns `SHA256(compressed_point)` (33-byte input including prefix byte). This produces a completely different ECDH secret value, which cascades to a wrong AESKEY, making cross-implementation encryption/decryption impossible.

**Evidence**: Runtime-verified against `test_vectors.json` vector N=0:
- Python ECDH: `47855ae8...95f14810d` → AESKEY `48db03bb...ff38ef42` ✅ (matches test vector)
- TS ECDH: `38273a07...2609931c` → AESKEY `3c18f7ed...94cd3c1e` ❌ (does not match)

**Why it wasn't caught**: The TS unit tests (`test/unit-tests.mjs`) verify internal consistency (TS→TS) but never cross-validate ECDH against the Python reference vectors. The live roundtrip test (`test/roundtrip.mjs`) fails due to an unrelated preamble format mismatch (server runs pre-2026-07-08 code), masking the ECDH bug.

### ⚠️ Informational Notes (non-blocking)

1. **Non-deterministic signatures**: Both TS (`@noble/curves` `schnorr.sign()` with random `auxRand`) and Python (`secp256k1-py` `schnorr_sign()` with random `aux_rand`) produce non-deterministic signatures by default. This is spec-compliant — only verification correctness matters.

2. **gzip implementation variance**: fflate and Python's zlib may produce different DEFLATE streams at the same compression level. Both are valid gzip; decompression yields identical data. Does not affect spec compliance.

3. **Legacy decode fallback**: TS `decode.ts:61-64` accepts 2-field pairs (old TITLE\0CONTENTS\0 format) in addition to 3-field triples. Python rejects pairs (`len % 3 != 1 → None`). TS is more permissive; not a spec violation for current-format records.

4. **gunzip padded-data workaround**: TS `crypto.ts:29-37` manually parses RFC-1952 gzip headers to work around fflate's `gunzipSync` returning empty on zero-padded data. Python uses `gzip.decompress()` which handles padding natively. Both produce correct decompressed output.

---

## Recommendation

**Priority 1 (blocking)**: Fix `computeEcdh()` in `src/lib/cm/crypto.ts` to hash the full 33-byte compressed shared point, matching `secp256k1-py >= 0.14.0` behavior:

```typescript
// BEFORE (incorrect):
const shared = secp256k1.getSharedSecret(myPrivKey, theirPubKeyCompressed);
return sha256(shared.subarray(1, 33));

// AFTER (correct):
const point = secp256k1.Point.fromBytes(theirPubKeyCompressed).multiply(bytesToNum(myPrivKey));
return sha256(point.toBytes(true));  // compressed: [0x02|0x03, x(32)] = 33 bytes
```

After the fix, add ECDH cross-validation tests against `spec/test_vectors.json` to prevent regression.
