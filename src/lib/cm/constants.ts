// Upstream provenance: python/centurymetadata/constants.py — byte-exact mirror,
// generated (there) from SPECIFICATION.md's "File Format" section.
// CM/File Format: DATA_LENGTH=16384
export const DATA_LENGTH = 16384;
// CM/File Format: MLKEM_CT_LENGTH=1568
export const MLKEM_CT_LENGTH = 1568;
export const SIGNATURE_LENGTH = 64;
export const PUBKEY_LENGTH = 33;
export const READER_ID_LENGTH = 32;
export const GENERATION_LENGTH = 8;
// CM/File Format: AES_TAG_LENGTH=16
export const AES_TAG_LENGTH = 16;
// Plaintext (post-zlib, pre-pad) budget: DATA_LENGTH minus the fixed-length
// cryptographic header -- SIG|WRITER_PUBKEY|READER_ID|GEN|MLKEM_CT, all of
// which live inside DATA_LENGTH (see decode.py's split_parts(), which reads
// SIG at after_preamble[0:64]) -- minus the AES-GCM tag.
export const PLAINTEXT_LENGTH =
  DATA_LENGTH - (SIGNATURE_LENGTH + PUBKEY_LENGTH + READER_ID_LENGTH + GENERATION_LENGTH + MLKEM_CT_LENGTH) - AES_TAG_LENGTH;
export const AES_LENGTH = PLAINTEXT_LENGTH + AES_TAG_LENGTH;
// CM: TAG: SHA256("centurymetadata v1"[18])
export const BIP340_TAG = 'centurymetadata v1';
// CM: MLKEM_Z_TAG: SHA256("centurymetadata v1 mlkem-z"[26])
export const MLKEM_Z_TAG = 'centurymetadata v1 mlkem-z';
// CM: WRITER_PUBKEY: BIP-32 0x44315441'/N'/0'
export const CM_PURPOSE = 0x44315441;
export const AUTHTOKEN = '0'.repeat(64);
export const PROXY_BASE = '/cm/api/v1';
// One record slot, as stored server-side and packed into bundles: DATA_LENGTH
// bytes (the preamble is sent on upload/verified on decode, but not stored).
export const SLOT_SIZE = DATA_LENGTH;
export const READER_ID_OFFSET = PUBKEY_LENGTH;

// Upstream provenance: python/centurymetadata/validate.py:24-30 ACCEPTED_TYPES
export const ACCEPTED_TYPES = [
  // CMREADME: * Type: `bitcoin psbt`, a base64-encoded PSBT for wallet to sign
  'bitcoin psbt',
  // CMREADME: * Type: `bitcoin transaction`, a hex-encoded transaction for wallet to broadcast
  'bitcoin transaction',
  'bitcoin miniscript',
  // CMREADME: * Type: `bitcoin output script descriptor`, a wallet descriptor string to wallet to find funds
  'bitcoin output script descriptor',
  'bitcoin wallet labels',
] as const;

// Upstream provenance: python/centurymetadata/constants.py — byte-exact mirror of `verheader + preamble`.
// 19-byte verheader "centurymetadata v1\0" + 1168-byte body = 1187 bytes total (SPECIFICATION.md 2026-07 rewrite:
// AES-256-GCM replaces CTR, GEN folds into AESKEY, zlib replaces gzip, DATA_LENGTH grew 8192 -> 16384).
// The body text MUST match upstream verbatim — the test server's decode.deconstruct() does
// `cmetadata.startswith(preamble)` verification, so any byte difference causes HTTP 400 "Incorrect preamble".
// Drift guard: test/unit-tests.mjs → "PREAMBLE describes TYPE\0NAME\0CONTENTS\0 triples".
export const PREAMBLE = new TextEncoder().encode(
  "centurymetadata v1\0SIG[64]|WRITER_PUBKEY[33]|READER_ID[32]|GEN[8]|MLKEM_CT[1568]|AES[14679]\n\nSIG: BIP-340 SHA256(TAG|TAG|WRITER_PUBKEY|READER_ID|GEN|MLKEM_CT|AES)\nWRITER_PUBKEY: BIP-32 0x44315441'/N'/0'\nREADER_SECP_PRIVKEY: BIP-32 0x44315441'/N'/1'\nREADER_SECP_PUBKEY: 33-byte compressed G*READER_SECP_PRIVKEY\nREADER_MLKEM_SEED_D: BIP-32 0x44315441'/N'/3'\nREADER_MLKEM_SEED_Z: BIP-340 SHA256(MLKEM_Z_TAG|MLKEM_Z_TAG|READER_MLKEM_SEED_D)\nMLKEM_Z_TAG: SHA256(\"centurymetadata v1 mlkem-z\"[26])\nREADER_MLKEM_PRIVKEY, READER_MLKEM_PUBKEY: ML-KEM-1024.KeyGen(d=READER_MLKEM_SEED_D,z=READER_MLKEM_SEED_Z)\nREADER_ID: SHA256(READER_SECP_PUBKEY|READER_MLKEM_PUBKEY)\nTAG: SHA256(\"centurymetadata v1\"[18])\nMLKEM_CT: ML-KEM-1024 (FIPS 203) ciphertext encapsulated to reader's ML-KEM key\nMLKEM_SECRET: ML-KEM-1024.Decaps(MLKEM_CT, READER_MLKEM_PRIVKEY)\nECDH_SECRET: EC Diffie-Hellman of WRITER_PUBKEY and READER_SECP_PRIVKEY = SHA256(33-byte compressed WRITER_PUBKEY*READER_SECP_PRIVKEY)\nAESKEY: SHA256(ECDH_SECRET|MLKEM_SECRET|GEN)\nAES: AES-256-GCM using AESKEY, 12-byte all-zero nonce, of DATA; 16-byte authentication tag appended\nDATA: ZLIB([TYPE\\0NAME\\0CONTENTS\\0]+), padded with 0 bytes to 14663\0",
);

// Full on-the-wire record: PREAMBLE + DATA_LENGTH (17571 bytes).
export const RECORD_LENGTH = PREAMBLE.length + DATA_LENGTH;
