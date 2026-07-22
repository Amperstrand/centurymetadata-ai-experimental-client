# Spec drift between this client and upstream centurymetadata

> **Audited**: 2026-07-22 against upstream master (HEAD `7946c80`, 2026-07-14)
> **Upstream spec canonical source**: https://github.com/rustyrussell/centurymetadata/blob/master/vars
> **Upstream reference implementation**: https://github.com/rustyrussell/centurymetadata/tree/master/python

This document tracks every place where this client intentionally diverges from
(or lags behind) the upstream spec, plus known deployment-lag issues with the
public test API at `https://testapi.centurymetadata.org`.

## Wire format

The on-the-wire byte layout in `src/lib/centurymetadata.ts` (constants
`FULL_LENGTH`, `MLKEM_CT_LENGTH`, `DATA_LENGTH`, `PREAMBLE`) is a **byte-exact
mirror** of upstream `python/centurymetadata/constants.py`. The PREAMBLE
constant reproduces the upstream text verbatim, including the trailing NUL.

`test/unit-tests.mjs → "PREAMBLE describes TYPE\0NAME\0CONTENTS\0 triples"`
guards against future drift on the PREAMBLE text.

## Test API deployment lag (IMPORTANT)

The public test API at `testapi.centurymetadata.org` is **not** running the
latest `master` HEAD. As of 2026-07-22 it serves the pre-2026-07-08 spec:

| Surface | test API behaviour (today) | master HEAD |
|---|---|---|
| PREAMBLE wire format | rejects `TYPE\0NAME\0CONTENTS\0` with HTTP 400 "Incorrect preamble"; accepts the old `TITLE\0CONTENTS\0` form | requires `TYPE\0NAME\0CONTENTS\0` (commit `c750c08`, 2026-07-08) |
| Known-keys enforcement (`TEST_MODE`) | NOT enforced — random unknown mnemonics can `authorize` | code present in `server.py:222-237` and `known_keys.py`, enforced only when `CENTURYMETADATA_TEST_MODE=1` |
| Content validation framework | NOT enforced — any TYPE/CONTENTS pair uploads | code present in `validate.py`, enforced only in `TEST_MODE` |

**Implication for `npm run test:roundtrip`**: the live round-trip test
**currently fails** with HTTP 400 "Incorrect preamble" because our PREAMBLE
matches master HEAD, not the lagging deployment. This is correct behaviour:
the test pins spec conformance with master, and will start passing again the
moment the upstream operator redeploys testapi at HEAD.

To verify crypto correctness end-to-end against the lagging deployment, use a
local server: `git clone https://github.com/rustyrussell/centurymetadata &&
cd centurymetadata && make localserver` (per upstream
`examples/EXAMPLES.md`), then point `test/roundtrip.mjs` at it.

## BIP-32 derivation paths

This client derives the four BIP-32 children `0x44315441'/N'/{0',1',2',3}'`,
matching upstream `bip39.py:83-97 derive_cm_keys`. The `N=0` derivation
against the standard "abandon×11 about" mnemonic reproduces the canonical
reader_id `46bdfb26fddb9e2962546ad2436e196feb29c0d873239a0954f1948e52bb44f3`
— see `test/unit-tests.mjs → EXPECTED.READER_ID`.

## XOR-PIR target bit

`src/lib/centurymetadata.ts:fetchSlotPrivate` calls
`generateXorPirMasks(bundle.index)`. The 128-byte `fetchxor` bitmask selects
**bundles within a directory** (1024 bits, one per bundle), per upstream
README "Retrieving Entries". There is no upstream primitive for hiding which
**slot within a bundle** a client wants; clients always scan the recovered
8 MB bundle for their own `reader_id`.

## Accepted Bitcoin record types

`src/lib/centurymetadata.ts:ACCEPTED_TYPES` lists the same five types as
upstream `validate.py:24-30 ACCEPTED_TYPES`. The browser validators in
`src/components/CmRecordTypes.svelte` are deliberately more permissive than
upstream's `embit`-based validators (we cannot ship `embit` to the browser);
they check syntax only and label the deeper structural check as
"server-side".

## Test server "known keys" scheme

Upstream `known_keys.py` defines a closed set of ~130 BIP-39 mnemonics that
the test server will accept when `TEST_MODE=1`: each is a single word
repeated 12 times whose BIP-39 checksum happens to be valid. The first half
(by wordlist index) are "self-authored" — the record's `WRITER_PUBKEY` must
match that same identity's own derived writer key; the second half are
reserved for the test server's pre-populated example data.

This client does **not** currently implement the known-keys scheme because
the public test API at `testapi.centurymetadata.org` does not enforce it
today. When (if) the operator turns `TEST_MODE=1` on, this client will need
a `knownKeysMnemonic(word)` helper. The first few known words, by wordlist
position, are `action`, `agent`, `aim`; the last few are `word`, `world`,
`yellow` (see upstream `python/centurymetadata/server/known_words.txt` for
the authoritative list).
