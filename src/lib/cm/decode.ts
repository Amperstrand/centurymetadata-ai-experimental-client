import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { secp256k1, schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { MLKEM_CT_LENGTH, BIP340_TAG, DATA_LENGTH, PUBKEY_LENGTH, READER_ID_LENGTH, GENERATION_LENGTH } from './constants.js';
import { concatBytes, taggedHash, bytesLEToInt64, toHex, splitBytes } from './utils.js';
import { computeEcdh, zlibDecompress, aesGcmDecrypt } from './crypto.js';
import { CmKeys } from './keys.js';

// Upstream provenance: python/centurymetadata/decode.py:14-31 CMDataErrorCode / CMDataError
export enum CMDataErrorCode {
  // Whole-file: nothing could be extracted from the file at all.
  BAD_LENGTH = 'BAD_LENGTH',
  BAD_WKEY = 'BAD_WKEY',
  BAD_READER_ID = 'BAD_READER_ID',
  BAD_SIGNATURE = 'BAD_SIGNATURE',
  BAD_AES_TAG = 'BAD_AES_TAG',
  BAD_ZLIB = 'BAD_ZLIB',
  TRUNCATED_ZLIB = 'TRUNCATED_ZLIB',
  OVERSIZE_ZLIB = 'OVERSIZE_ZLIB',
  // Per-record: one specific record was malformed; others may still be usable.
  TRUNCATED_TUPLE = 'TRUNCATED_TUPLE',
  OVERLENGTH_NAME = 'OVERLENGTH_NAME',
  INVALID_UTF8 = 'INVALID_UTF8',
}

export interface CMDataError {
  code: CMDataErrorCode;
  message: string;
  // True if no data at all could be extracted from the slot: one of the
  // whole-file failures above. False for a per-record error, where other
  // records may have been extracted successfully regardless.
  fatal: boolean;
  // True if parsing stopped at this error: no tuples after this one were
  // parsed. Always true when `fatal` is true. For a per-record error, true
  // unless this was a to-self slot (which continues past malformed
  // records) -- except TRUNCATED_TUPLE, which always stops.
  stopped: boolean;
  // Which tuple (0-based, in slot order) this applies to. Only set for
  // per-record (non-fatal) errors.
  recordIndex?: number;
}

export interface DecodedSlot {
  errors: CMDataError[];
  // True iff errors[0].fatal -- no triples could be extracted at all.
  fatal: boolean;
  // CM: If `WRITER_PUBKEY` equals the pubkey the reader itself would derive at
  // CM: `0x44315441'/N'/0'` (for the `N` used to derive this file's reader keys):
  // CM:   - The file is referred to as "to-self".
  toSelf: boolean;
  generation: number;
  triples: [string, string, string][];
  debug: {
    ecdhPrefix: string;
    aesKeyPrefix: string;
    encryptedLen: number;
    decryptedLen: number;
    decryptedZlibHeader: string;
    decompressedLen: number;
    decompressedHex: string;
    parsedText: string;
  } | null;
}

function fatalResult(code: CMDataErrorCode, message: string): DecodedSlot {
  return {
    errors: [{ code, message, fatal: true, stopped: true }],
    fatal: true,
    toSelf: false,
    generation: 0,
    triples: [],
    debug: null,
  };
}

const utf8Strict = new TextDecoder('utf-8', { fatal: true });

interface DecompressResult {
  errors: CMDataError[];
  triples: [string, string, string][];
  // Present only when decompression itself succeeded (independent of any
  // subsequent per-record errors) -- for debug/UI display.
  uncompressed?: Uint8Array;
}

// Upstream provenance: python/centurymetadata/decode.py:57-165 decompress()
// CM: MUST parse the decompressed bytes as a sequence of TYPE\0NAME\0CONTENTS\0 tuples, in order:
function decompressTriples(comp: Uint8Array, toSelf: boolean): DecompressResult {
  const inflated = zlibDecompress(comp);
  if (!inflated.ok) {
    // CM: MUST fail parsing if the decrypted bytes do not contain a valid [zlib](#ref-zlib) stream.
    const code = inflated.truncated ? CMDataErrorCode.TRUNCATED_ZLIB : CMDataErrorCode.BAD_ZLIB;
    const message = inflated.truncated ? 'truncated zlib stream' : 'not a valid zlib stream';
    return { errors: [{ code, message, fatal: true, stopped: true }], triples: [] };
  }
  const uncomp = inflated.data!;
  // CM: MUST fail parsing if the decompressed size would exceed 1048576 bytes.
  if (uncomp.length > 1048576) {
    return {
      errors: [{ code: CMDataErrorCode.OVERSIZE_ZLIB, message: 'oversize zlib stream', fatal: true, stopped: true }],
      triples: [],
    };
  }

  // CM: MUST separate `TYPE`, `NAME` and `CONTENTS` by NUL terminators.
  let fields = splitBytes(uncomp, 0);
  const ret: [string, string, string][] = [];
  const errors: CMDataError[] = [];

  // split() above leaves a single empty trailing element for the final NUL.
  let index = 0;
  while (!(fields.length === 1 && fields[0].length === 0)) {
    // CM: MUST stop processing (keeping all tuples already parsed) upon reaching a tuple
    // CM: for which fewer than three NUL-terminated fields remaing.
    if (fields.length < 3) {
      errors.push({
        code: CMDataErrorCode.TRUNCATED_TUPLE, message: 'unexpected remaining tuples',
        fatal: false, stopped: true, recordIndex: index,
      });
      break;
    }

    let recordFailed = false;

    // CM: Otherwise, if `NAME` is greater than 255 bytes:
    // CM:   - MUST fail to parse this record
    if (fields[1].length > 255) {
      errors.push({
        code: CMDataErrorCode.OVERLENGTH_NAME, message: 'overlength name field',
        fatal: false, stopped: !toSelf, recordIndex: index,
      });
      recordFailed = true;
    }

    // CM: If any of `TYPE`, `NAME` or `CONTENTS` are not a valid, complete UTF-8 string:
    // CM:   - MUST fail to parse this record
    let typestr = '', namestr = '', contentstr = '';
    try {
      typestr = utf8Strict.decode(fields[0]);
      namestr = utf8Strict.decode(fields[1]);
      contentstr = utf8Strict.decode(fields[2]);
    } catch {
      errors.push({
        code: CMDataErrorCode.INVALID_UTF8, message: 'invalid UTF-8 in tuple',
        fatal: false, stopped: !toSelf, recordIndex: index,
      });
      recordFailed = true;
    }

    fields = fields.slice(3);
    index++;

    // CM: If this record "fails to parse" (defined below):
    // CM:   - If this is a "to-self" file:
    // CM:     - MUST continue parsing remaining tuples
    // CM:   - Otherwise (not a "to-self" file):
    // CM:     - MAY continue parsing remaining tuples
    if (recordFailed) {
      if (toSelf) continue;
      break;
    }

    ret.push([typestr, namestr, contentstr]);
  }

  return { errors, triples: ret, uncompressed: uncomp };
}

// Upstream provenance: python/centurymetadata/decode.py:238-319 decode()
// Operates on a slot (DATA_LENGTH bytes, preamble already stripped/verified by the
// caller) -- matching how this client always handles records (network slots never
// carry the preamble; encodeRecord()'s `slot` output excludes it too).
export async function decodeSlot(keys: CmKeys, slot: Uint8Array): Promise<DecodedSlot> {
  if (slot.length !== DATA_LENGTH) {
    return fatalResult(CMDataErrorCode.BAD_LENGTH, `expected ${DATA_LENGTH} bytes, got ${slot.length}`);
  }

  const sig = slot.subarray(0, 64);
  const wkeyOff = 64;
  const readerIdOff = wkeyOff + PUBKEY_LENGTH;
  const genOff = readerIdOff + READER_ID_LENGTH;
  const mlkemCtOff = genOff + GENERATION_LENGTH;
  const aesOff = mlkemCtOff + MLKEM_CT_LENGTH;

  const wkeyRaw = slot.subarray(wkeyOff, readerIdOff);
  const readerId = slot.subarray(readerIdOff, genOff);
  const genBytes = slot.subarray(genOff, mlkemCtOff);
  const mlkemCt = slot.subarray(mlkemCtOff, aesOff);
  const encrypted = slot.subarray(aesOff);
  const gen = bytesLEToInt64(genBytes);

  // Upstream split_parts()'s point-validity check happens before the signature
  // check itself (see the full SIG quote below): an invalid compressed point
  // can't be parsed at all, let alone verified.
  let wkeyPoint;
  try {
    wkeyPoint = secp256k1.Point.fromBytes(wkeyRaw);
  } catch (e) {
    return fatalResult(CMDataErrorCode.BAD_WKEY, `invalid WRITER_PUBKEY: ${e instanceof Error ? e.message : e}`);
  }
  const wkey = wkeyPoint.toBytes(true);

  // CM: MUST fail parsing if `READER_ID` does not equal [SHA256](#ref-sha256)(`READER_SECP_PUBKEY`|`READER_MLKEM_PUBKEY`)
  // CM: for a keypair the reader holds the secrets to.
  if (toHex(readerId) !== toHex(keys.readerId)) {
    return fatalResult(CMDataErrorCode.BAD_READER_ID, 'incorrect READER_ID');
  }

  // CM: MUST fail parsing if `SIG` is not a valid [BIP-340](#ref-bip340) signature by `WRITER_PUBKEY` over
  // CM: SHA256(`TAG`|`TAG`|`WRITER_PUBKEY`|`READER_ID`|`GEN`|`MLKEM_CT`|`AES`).
  const contentBytes = slot.subarray(wkeyOff);
  const prehash = taggedHash(BIP340_TAG, contentBytes);
  const writerXOnly = wkey.subarray(1, 33);
  const sigValid = schnorr.verify(sig, prehash, writerXOnly);
  if (!sigValid) {
    return fatalResult(CMDataErrorCode.BAD_SIGNATURE, 'invalid signature');
  }

  // CM: If `WRITER_PUBKEY` equals the pubkey the reader itself would derive at
  // CM: `0x44315441'/N'/0'` (for the `N` used to derive this file's reader keys):
  // CM:   - The file is referred to as "to-self".
  const toSelf = toHex(wkey) === toHex(keys.writerPubKey);

  // CM: MUST compute the 32-byte `MLKEM_SECRET` by decapsulating `MLKEM_CT`.
  const mlkemSecret = new Uint8Array(ml_kem1024.decapsulate(mlkemCt, keys.mlkemSecretKey));

  // CM: MUST compute `ECDH_SECRET` as SHA256 of the 33-byte compressed EC point from
  // CM: [Diffie-Hellman](#ref-ecdh) of `WRITER_PUBKEY` and `READER_SECP_PRIVKEY`.
  const ecdhSecret = computeEcdh(keys.readerSecpPrivKey, wkey);

  // CM: MUST SHA256 the concatenation of `ECDH_SECRET`, `MLKEM_SECRET` and `GEN` to derive the `AESKEY`.
  const aesKey = sha256(concatBytes(ecdhSecret, mlkemSecret, genBytes));

  // CM: MUST use `AESKEY` to [AES](#ref-aes)-256-[GCM](#ref-gcm)-decrypt the `AES` bytes...
  // CM: MUST fail parsing if the trailing 16-byte authentication tag does not verify.
  const comp = await aesGcmDecrypt(aesKey, encrypted);
  if (comp === null) {
    return fatalResult(CMDataErrorCode.BAD_AES_TAG, 'authentication tag did not verify');
  }

  const { errors, triples, uncompressed } = decompressTriples(comp, toSelf);
  const fatal = errors.length > 0 && errors[0].fatal;

  return {
    errors,
    fatal,
    toSelf,
    generation: Number(gen),
    triples,
    debug: {
      ecdhPrefix: toHex(ecdhSecret.subarray(0, 8)),
      aesKeyPrefix: toHex(aesKey.subarray(0, 8)),
      encryptedLen: encrypted.length,
      decryptedLen: comp.length,
      decryptedZlibHeader: toHex(comp.subarray(0, 2)),
      decompressedLen: uncompressed?.length ?? 0,
      decompressedHex: uncompressed ? toHex(uncompressed.subarray(0, 50)) : '',
      parsedText: triples.map(([t, n, c]) => `${t}\0${n}\0${c}`).join('\0'),
    },
  };
}

// Upstream provenance: python/centurymetadata/decode.py:214-222 check_sig() + split_parts()
// Verify the BIP-340 Schnorr signature over taggedHash(TAG, contentBytes) where contentBytes
// = everything after SIG (= WRITER_PUBKEY || READER_ID || GEN || MLKEM_CT || AES).
// No reader-side secrets needed -- anyone can verify a record's authenticity from the slot alone.
export function checkSignature(slot: Uint8Array): boolean {
  if (slot.length !== DATA_LENGTH) return false;
  const sig = slot.subarray(0, 64);
  const writerPub = slot.subarray(64, 97);
  let wkey;
  try {
    wkey = secp256k1.Point.fromBytes(writerPub).toBytes(true);
  } catch {
    return false;
  }
  const contentBytes = slot.subarray(64);
  const prehash = taggedHash(BIP340_TAG, contentBytes);
  const writerXOnly = wkey.subarray(1, 33);
  return schnorr.verify(sig, prehash, writerXOnly);
}
