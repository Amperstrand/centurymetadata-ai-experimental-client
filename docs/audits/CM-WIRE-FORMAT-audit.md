# centurymetadata Wire Format Audit

> **Status**: PENDING — Run this prompt through opencode to audit
> **Spec**: `spec/README.md` (upstream rustyrussell/centurymetadata)
> **Spec quotes**: 19 embedded in code (verified by greatspectations)

## Objective

Audit whether the centurymetadata client implementation **semantically complies**
with the upstream wire format specification. Verify the CODE actually DOES what
the spec SAYS, and compare against the Python reference implementation.

## Implementation Files

- `src/lib/cm/constants.ts` — PREAMBLE, ACCEPTED_TYPES, TAG constants
- `src/lib/cm/keys.ts` — BIP-32 derivation paths, READER_ID computation
- `src/lib/cm/crypto.ts` — ECDH, AES-CTR, SHA-256
- `src/lib/cm/encode.ts` — encodeRecord (full pipeline: triples → gzip → AES → sign)
- `src/lib/cm/decode.ts` — decodeSlot (reverse pipeline: verify → decrypt → gunzip → parse)

## Reference Implementation (Python)

The Python reference is in the spec submodule at `spec/python/centurymetadata/`:

- `spec/python/centurymetadata/constants.py` — wire format constants
- `spec/python/centurymetadata/encode.py` — encode pipeline
- `spec/python/centurymetadata/decode.py` — decode pipeline
- `spec/python/centurymetadata/bip39.py` — BIP-32 key derivation

## Audit Instructions

For each requirement in the spec README:

1. **Read the spec**: Open `spec/README.md`. Focus on the `## File Format` section
   (the fenced code block defining the wire format) and `## Usage with Bitcoin`.

2. **Read the implementation**: Open each TypeScript file listed above.

3. **Read the reference**: Open each Python file. The Python code is the canonical
   implementation — the TypeScript port should produce byte-identical output.

4. **Audit each field**:

```
### Field: [field name]
**Spec**: spec/README.md — [exact spec text]
**Status**: ✅/⚠️/❌/🔍
**TS impl**: [file:line — what the code does]
**Python ref**: [file:line — how the reference does it]
**Byte match?**: Do both produce identical bytes for the same input?
```

## Key Audit Points

1. **PREAMBLE constant**: Must be byte-exact `centurymetadata v1\0SIG[64]|...`
2. **BIP-32 paths**: `m/0x44315441'/N'/{0',1',2',3'}'` — all 4 paths correct
3. **ML-KEM key derivation**: d‖z seed from BIP-32, z from BIP-340 tagged hash
4. **READER_ID**: `SHA256(secp_pubkey | mlkem_pubkey)` — byte order matters
5. **AES-CTR**: nonce=0, counter starting at 0
6. **gzip OS byte**: must be 0xff for cross-platform reproducibility
7. **SIG**: BIP-340 Schnorr over `TAG|TAG|WRITER_PUBKEY|READER_ID|GEN|MLKEM_CT|AES`
8. **DATA**: `gzip([TYPE\0NAME\0CONTENTS\0]+)` — NUL-separated triples
9. **Record types**: exactly 5 accepted types, exact string match

## Output

Save the report to `docs/audits/results/CM-WIRE-FORMAT-result.md`.
