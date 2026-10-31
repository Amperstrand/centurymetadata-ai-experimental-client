import { concatBytes } from './utils.js';

// Upstream provenance: python/centurymetadata/constants.py:11-17 (generated from
// SPECIFICATION.md "File Format" by tools/generate_constants.py at master 547b543).
// verheader = b"centurymetadata v1\0"; preamble = verheader + body; bip340tag = verheader[:-1]
// DATA_LENGTH is the post-preamble binary slot size (SIG..AES inclusive).
export const DATA_LENGTH = 16384;
export const MLKEM_CT_LENGTH = 1568;
export const PLAINTEXT_LENGTH = 14663;
export const AES_LENGTH = 14679;
export const RECORD_LENGTH = 1187 + DATA_LENGTH; // = len(preamble) + DATA_LENGTH = 17571
// CM: TAG: SHA256("centurymetadata v1"[18])
export const BIP340_TAG = 'centurymetadata v1';
// CM: MLKEM_Z_TAG: SHA256("centurymetadata v1 mlkem-z"[26])
export const MLKEM_Z_TAG = 'centurymetadata v1 mlkem-z';
// CM-README: `0x44315441'/N'/0'` through `/3'` (`DATA`),
export const CM_PURPOSE = 0x44315441;

// Reader- and writer-side cap on the decompressed triples payload (upstream decode.py semantics)
export const MAX_DECOMPRESSED = 1048576;
export const AUTHTOKEN = '0'.repeat(64);
export const PROXY_BASE = '/cm/api/v1';
export const SLOT_SIZE = DATA_LENGTH;
export const READER_ID_OFFSET = 64 + 33;

// Upstream provenance: python/centurymetadata/validate.py:24-30 ACCEPTED_TYPES (unchanged at 547b543).
// NOTE: validate.py governs the test server's TEST_MODE validation. The SPECIFICATION.md
// record-type list has since diverged from it (spec drops `bitcoin miniscript` and adds
// `next cmdata derivation path`); we keep mirroring validate.py until upstream updates it.
export const ACCEPTED_TYPES = [
  // Upstream provenance: validate.py ACCEPTED_TYPES — 'bitcoin psbt' (base64 PSBT)
  'bitcoin psbt',
  // Upstream provenance: validate.py ACCEPTED_TYPES — 'bitcoin transaction' (hex tx)
  'bitcoin transaction',
  // Upstream provenance: validate.py ACCEPTED_TYPES — 'bitcoin miniscript' (still accepted
  // by validate.py; no longer listed in upstream README/SPECIFICATION.md)
  'bitcoin miniscript',
  // Upstream provenance: validate.py ACCEPTED_TYPES — 'bitcoin output script descriptor'
  'bitcoin output script descriptor',
  // Upstream provenance: validate.py ACCEPTED_TYPES — 'bitcoin wallet labels' (BIP-329 JSONL)
  'bitcoin wallet labels',
] as const;

// Upstream provenance: python/centurymetadata/constants.py:4-8 — byte-exact mirror of `verheader + preamble`.
// 19-byte verheader "centurymetadata v1\0" + 1168-byte body = 1187 bytes total.
// The body text MUST match upstream verbatim — the test server's decode.deconstruct() does
// `cmetadata.startswith(preamble)` verification, so any byte difference causes HTTP 400 "Incorrect preamble".
// Drift guard: test/unit-tests.mjs → "PREAMBLE describes ZLIB TYPE\0NAME\0CONTENTS\0 triples".
// CM: SIG[64]|WRITER_PUBKEY[33]|READER_ID[32]|GEN[8]|MLKEM_CT[1568]|AES[14679]
export const PREAMBLE = (() => {
  const verheader = new TextEncoder().encode('centurymetadata v1\0');
  const bodyStr =
    'SIG[64]|WRITER_PUBKEY[33]|READER_ID[32]|GEN[8]|MLKEM_CT[1568]|AES[14679]\n\n' +
    'SIG: BIP-340 SHA256(TAG|TAG|WRITER_PUBKEY|READER_ID|GEN|MLKEM_CT|AES)\n' +
    "WRITER_PUBKEY: BIP-32 0x44315441'/N'/0'\n" +
    "READER_SECP_PRIVKEY: BIP-32 0x44315441'/N'/1'\n" +
    'READER_SECP_PUBKEY: 33-byte compressed G*READER_SECP_PRIVKEY\n' +
    "READER_MLKEM_SEED_D: BIP-32 0x44315441'/N'/3'\n" +
    'READER_MLKEM_SEED_Z: BIP-340 SHA256(MLKEM_Z_TAG|MLKEM_Z_TAG|READER_MLKEM_SEED_D)\n' +
    'MLKEM_Z_TAG: SHA256("centurymetadata v1 mlkem-z"[26])\n' +
    'READER_MLKEM_PRIVKEY, READER_MLKEM_PUBKEY: ML-KEM-1024.KeyGen(d=READER_MLKEM_SEED_D,z=READER_MLKEM_SEED_Z)\n' +
    'READER_ID: SHA256(READER_SECP_PUBKEY|READER_MLKEM_PUBKEY)\n' +
    'TAG: SHA256("centurymetadata v1"[18])\n' +
    "MLKEM_CT: ML-KEM-1024 (FIPS 203) ciphertext encapsulated to reader's ML-KEM key\n" +
    'MLKEM_SECRET: ML-KEM-1024.Decaps(MLKEM_CT, READER_MLKEM_PRIVKEY)\n' +
    'ECDH_SECRET: EC Diffie-Hellman of WRITER_PUBKEY and READER_SECP_PRIVKEY = SHA256(33-byte compressed WRITER_PUBKEY*READER_SECP_PRIVKEY)\n' +
    'AESKEY: SHA256(ECDH_SECRET|MLKEM_SECRET|GEN)\n' +
    'AES: AES-256-GCM using AESKEY, 12-byte all-zero nonce, of DATA; 16-byte authentication tag appended\n' +
    'DATA: ZLIB([TYPE\\0NAME\\0CONTENTS\\0]+), padded with 0 bytes to 14663\0';
  const body = new TextEncoder().encode(bodyStr);
  return concatBytes(verheader, body);
})();
