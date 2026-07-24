import { concatBytes } from './utils.js';

// Upstream provenance: python/centurymetadata/constants.py:21-26
// verheader = b"centurymetadata v1\0"; preamble = verheader + body; bip340tag = verheader[:-1]
export const FULL_LENGTH = 8192;
export const MLKEM_CT_LENGTH = 1568;
export const DATA_LENGTH = FULL_LENGTH - (64 + 33 + 32 + 8 + MLKEM_CT_LENGTH);
export const BIP340_TAG = 'centurymetadata v1';
export const MLKEM_Z_TAG = 'centurymetadata v1 mlkem-z';
export const CM_PURPOSE = 0x44315441;
export const AUTHTOKEN = '0'.repeat(64);
export const PROXY_BASE = '/cm/api/v1';
export const SLOT_SIZE = 8192;
export const READER_ID_OFFSET = 64 + 33;

// Upstream provenance: python/centurymetadata/validate.py:24-30 ACCEPTED_TYPES
export const ACCEPTED_TYPES = [
  'bitcoin psbt',
  'bitcoin transaction',
  'bitcoin miniscript',
  'bitcoin output script descriptor',
  'bitcoin wallet labels',
] as const;

// Upstream provenance: python/centurymetadata/constants.py:1-19 — byte-exact mirror of `verheader + preamble`.
// 19-byte verheader "centurymetadata v1\0" + 1032-byte body = 1051 bytes total.
// The body text MUST match upstream verbatim — the test server's decode.deconstruct() does
// `cmetadata.startswith(preamble)` verification, so any byte difference causes HTTP 400 "Incorrect preamble".
// Drift guard: test/unit-tests.mjs → "PREAMBLE describes TYPE\0NAME\0CONTENTS\0 triples".
export const PREAMBLE = (() => {
  const verheader = new TextEncoder().encode('centurymetadata v1\0');
  const bodyStr =
    'SIG[64]|WRITER_PUBKEY[33]|READER_ID[32]|GEN[8]|MLKEM_CT[1568]|AES[6487]\n\n' +
    'SIG: BIP-340 SHA256(TAG|TAG|WRITER_PUBKEY|READER_ID|GEN|MLKEM_CT|AES)\n' +
    "WRITER_PUBKEY: BIP-32 0x44315441'/N'/0'\n" +
    "READER_SECP_PRIVKEY: BIP-32 0x44315441'/N'/1'\n" +
    'READER_SECP_PUBKEY: G*READER_SECP_PRIVKEY\n' +
    "READER_MLKEM_SEED_D: BIP-32 0x44315441'/N'/3'\n" +
    'READER_MLKEM_SEED_Z: BIP-340 SHA256(MLKEM_Z_TAG|MLKEM_Z_TAG|READER_MLKEM_SEED_D)\n' +
    'MLKEM_Z_TAG: SHA256("centurymetadata v1 mlkem-z"[26])\n' +
    'READER_MLKEM_PRIVKEY, READER_MLKEM_PUBKEY: ML-KEM.KeyGen(d=READER_MLKEM_SEED_D,z=READER_MLKEM_SEED_Z)\n' +
    'READER_ID: SHA256(READER_SECP_PUBKEY|READER_MLKEM_PUBKEY)\n' +
    'TAG: SHA256("centurymetadata v1"[18])\n' +
    "MLKEM_CT: ML-KEM-1024 (FIPS 203) ciphertext encapsulated to reader's ML-KEM key\n" +
    'MLKEM_SECRET: ML-KEM-1024.Decaps(MLKEM_CT, READER_MLKEM_PRIVKEY)\n' +
    'ECDH_SECRET: EC Diffie-Hellman of WRITER_PUBKEY and READER_SECP_PRIVKEY\n' +
    'AESKEY: SHA256(ECDH_SECRET|MLKEM_SECRET)\n' +
    'AES: CTR mode (starting 0, nonce 0) using AESKEY of DATA\n' +
    'DATA: gzip([TYPE\\0NAME\\0CONTENTS\\0]+), padded with 0 bytes to 6487\0';
  const body = new TextEncoder().encode(bodyStr);
  return concatBytes(verheader, body);
})();
