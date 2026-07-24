import { PROXY_BASE, SLOT_SIZE, READER_ID_OFFSET, AUTHTOKEN } from './constants.js';
import { toHex } from './utils.js';
import { SlotPublic, NetworkStats } from './types.js';

// Upstream provenance: README.md "Entry Creation: POST /api/v1/authorize/{READER_ID}/{WRITER}/{AUTHTOKEN}".
// AUTHTOKEN = "0"×64 per server.py:240-243 (test API convention).
export async function authorizeWriter(
  readerId: Uint8Array,
  writerPubKey: Uint8Array,
): Promise<{ ok: boolean; status: number; text: string }> {
  const readerIdHex = toHex(readerId);
  const writerPubHex = toHex(writerPubKey);
  const res = await fetch(`${PROXY_BASE}/authorize/${readerIdHex}/${writerPubHex}/${AUTHTOKEN}`, {
    method: 'POST',
    body: '',
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

// Upstream provenance: README.md "Entry Update: POST /api/v1/update".
// Content-Type: application/x-centurymetadata; body = preamble + 8192-byte slot = 9243 bytes.
export async function uploadRecord(
  fullRecord: Uint8Array,
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(`${PROXY_BASE}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-centurymetadata' },
    body: new Uint8Array(fullRecord),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

// Upstream provenance: README.md "Retrieving Entries: POST /api/v1/fetchxor/{DIRECTORY}" +
// centurytool.py:13-52 fetch_slot(). Sets a single-bit bitmask at bundle.index to fetch that
// bundle (1024 × 8192 = 8 MB), then scans all slots for matching reader_id at offset 97.
export async function fetchSlots(readerId: Uint8Array): Promise<Uint8Array[]> {
  const listRes = await fetch(`${PROXY_BASE}/listbundles`);
  const bundles = await listRes.json() as { directory: string; index: number }[];

  const foundSlots: Uint8Array[] = [];

  for (const bundle of bundles) {
    const bitmask = new Uint8Array(128);
    bitmask[Math.floor(bundle.index / 8)] |= 1 << (bundle.index % 8);
    const fetchRes = await fetch(`${PROXY_BASE}/fetchxor/${bundle.directory}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bitmask,
    });
    const bundleData = new Uint8Array(await fetchRes.arrayBuffer());
    for (let i = 0; i + SLOT_SIZE <= bundleData.length; i += SLOT_SIZE) {
      const slotView = bundleData.subarray(i, i + SLOT_SIZE);
      const slotReaderId = slotView.subarray(READER_ID_OFFSET, READER_ID_OFFSET + 32);
      let match = true;
      for (let j = 0; j < 32; j++) {
        if (slotReaderId[j] !== readerId[j]) { match = false; break; }
      }
      if (match) foundSlots.push(slotView);
    }
  }

  return foundSlots;
}

// Upstream provenance: README.md "Retrieving Entries: POST /api/v1/fetchxor/{DIRECTORY}" + examples/EXAMPLES.md.
// 128-byte (1024-bit) bitmask selects which BUNDLES in a DIRECTORY to XOR. A single-bit
// bitmask returns one raw bundle; this helper composes two complementary masks that differ
// only at targetBit, so XORing the two server responses cancels every noise bundle and
// recovers the target bundle without either server learning which one was wanted.
export function generateXorPirMasks(targetBit: number): { maskA: Uint8Array; maskB: Uint8Array } {
  const maskA = crypto.getRandomValues(new Uint8Array(128));
  maskA[Math.floor(targetBit / 8)] |= 1 << (targetBit % 8);
  const maskB = new Uint8Array(maskA);
  maskB[Math.floor(targetBit / 8)] ^= 1 << (targetBit % 8);
  return { maskA, maskB };
}

export function xorBundles(a: Uint8Array, b: Uint8Array): Uint8Array {
  const len = Math.min(a.length, b.length);
  const result = new Uint8Array(len);
  for (let i = 0; i < len; i++) result[i] = a[i] ^ b[i];
  return result;
}

// Upstream provenance: README.md "Retrieving Entries" private-retrieval paragraph +
// examples/EXAMPLES.md XOR-PIR walkthrough. Two-server PIR: query two servers with
// complementary bundle bitmasks (differ only at the target bundle's bit), XOR their
// responses to recover the target bundle, then client-side scan for the reader_id.
export async function fetchSlotPrivate(
  serverBaseA: string,
  serverBaseB: string,
  readerId: Uint8Array,
): Promise<Uint8Array | null> {
  const listRes = await fetch(`${serverBaseA}/listbundles`);
  const bundles = await listRes.json() as { directory: string; index: number }[];

  for (const bundle of bundles) {
    const singleMask = new Uint8Array(128);
    singleMask[Math.floor(bundle.index / 8)] |= 1 << (bundle.index % 8);
    const probeRes = await fetch(`${serverBaseA}/fetchxor/${bundle.directory}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: singleMask,
    });
    const probeData = new Uint8Array(await probeRes.arrayBuffer());

    let slotIdx = -1;
    for (let i = 0; i + SLOT_SIZE <= probeData.length; i += SLOT_SIZE) {
      const slotRid = probeData.subarray(i + READER_ID_OFFSET, i + READER_ID_OFFSET + 32);
      let match = true;
      for (let j = 0; j < 32; j++) {
        if (slotRid[j] !== readerId[j]) { match = false; break; }
      }
      if (match) { slotIdx = i / SLOT_SIZE; break; }
    }
    if (slotIdx < 0) continue;

    if (serverBaseA === serverBaseB) return probeData.subarray(slotIdx * SLOT_SIZE, (slotIdx + 1) * SLOT_SIZE);

    // XOR-PIR target bit = bundle's position in the directory (the 128-byte / 1024-bit
    // fetchxor bitmask selects BUNDLES, not slots-within-bundle). The reader_id is
    // recovered by client-side scan after the bundle is XORed back out of the two
    // server responses. Hiding WHICH slot a client wants is not expressible in the
    // upstream API; clients always scan the whole 8 MB bundle for their reader_id.
    // (Previously this used `globalBit = bundle.index * 1024 + slotIdx` then took
    // `% 1024`, which collapsed to slotIdx and only worked by accident when the
    // directory contained a single bundle at index 0.)
    const { maskA, maskB } = generateXorPirMasks(bundle.index);

    const [resA, resB] = await Promise.all([
      fetch(`${serverBaseA}/fetchxor/${bundle.directory}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(maskA),
      }),
      fetch(`${serverBaseB}/fetchxor/${bundle.directory}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(maskB),
      }),
    ]);
    const dataA = new Uint8Array(await resA.arrayBuffer());
    const dataB = new Uint8Array(await resB.arrayBuffer());
    const xored = xorBundles(dataA, dataB);
    return xored.subarray(slotIdx * SLOT_SIZE, (slotIdx + 1) * SLOT_SIZE);
  }
  return null;
}

/**
 * Find the current (highest) generation for a given writer in the fetched slots.
 * Returns 0n if no existing record is found (first write).
 * Each (READER_ID, WRITER) pair has one active slot; writing gen N+1 replaces gen N.
 */
export function getMaxGeneration(
  slots: Uint8Array[],
  writerPubKey: Uint8Array,
): bigint {
  let maxGen = 0n;
  for (const slot of slots) {
    const slotWriterPub = slot.subarray(64, 97);
    let match = true;
    for (let j = 0; j < 33; j++) {
      if (slotWriterPub[j] !== writerPubKey[j]) { match = false; break; }
    }
    if (match) {
      const slotGen = slot.subarray(129, 137);
      const gen =
        (BigInt(slotGen[0]) << 56n) | (BigInt(slotGen[1]) << 48n) |
        (BigInt(slotGen[2]) << 40n) | (BigInt(slotGen[3]) << 32n) |
        (BigInt(slotGen[4]) << 24n) | (BigInt(slotGen[5]) << 16n) |
        (BigInt(slotGen[6]) << 8n) | BigInt(slotGen[7]);
      if (gen > maxGen) maxGen = gen;
    }
  }
  return maxGen;
}

export function isSlotEmpty(slot: Uint8Array): boolean {
  for (let i = 0; i < slot.length; i++) {
    if (slot[i] !== 0) return false;
  }
  return true;
}

// Upstream provenance: decode.py:34-49 split_parts() — field offsets for WRITER_PUBKEY[33],
// READER_ID[32], GEN[8] at byte positions 64, 97, 129 respectively within the 8192-byte slot.
export function parseSlotPublic(slot: Uint8Array, index: number): SlotPublic {
  if (isSlotEmpty(slot)) {
    return { index, occupied: false, writerPubkey: null, writerXOnly: null, readerId: null, generation: null };
  }
  const writerPub = slot.subarray(64, 97);
  const readerId = slot.subarray(97, 129);
  const genBytes = slot.subarray(129, 137);
  const generation = Number(
    (BigInt(genBytes[0]) << 56n) | (BigInt(genBytes[1]) << 48n) |
    (BigInt(genBytes[2]) << 40n) | (BigInt(genBytes[3]) << 32n) |
    (BigInt(genBytes[4]) << 24n) | (BigInt(genBytes[5]) << 16n) |
    (BigInt(genBytes[6]) << 8n) | BigInt(genBytes[7]),
  );
  return {
    index,
    occupied: true,
    writerPubkey: toHex(writerPub),
    writerXOnly: toHex(writerPub.subarray(1, 33)),
    readerId: toHex(readerId),
    generation,
  };
}

// Upstream provenance: README.md "Listing Bundles: GET /api/v1/listbundles" +
// "Retrieving Entries: POST /api/v1/fetchxor/{DIRECTORY}". Probes bundle 0 (bitmask[0]=1)
// of each directory and parses the resulting 1024 × 8192-byte slots for public metadata.
export async function scanNetwork(): Promise<{ slots: SlotPublic[]; stats: NetworkStats }> {
  const listRes = await fetch(`${PROXY_BASE}/listbundles`);
  const bundles = await listRes.json() as { directory: string; index: number }[];

  const allSlots: SlotPublic[] = [];
  let totalSlotCount = 0;

  for (const bundle of bundles) {
    const bitmask = new Uint8Array(128);
    bitmask[0] = 1;
    const fetchRes = await fetch(`${PROXY_BASE}/fetchxor/${bundle.directory}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bitmask,
    });
    const bundleData = new Uint8Array(await fetchRes.arrayBuffer());
    const slotCount = Math.floor(bundleData.length / SLOT_SIZE);
    totalSlotCount += slotCount;
    for (let i = 0; i < slotCount; i++) {
      allSlots.push(parseSlotPublic(bundleData.subarray(i * SLOT_SIZE, (i + 1) * SLOT_SIZE), i));
    }
  }

  const occupied = allSlots.filter(s => s.occupied);
  const writers = new Set(occupied.map(s => s.writerPubkey));
  const readers = new Set(occupied.map(s => s.readerId));

  return {
    slots: allSlots,
    stats: {
      totalBundles: bundles.length,
      totalSlots: totalSlotCount,
      occupiedSlots: occupied.length,
      uniqueWriters: writers.size,
      uniqueReaders: readers.size,
    },
  };
}
