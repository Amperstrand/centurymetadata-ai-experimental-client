<script lang="ts">
  import { gzipSync } from 'fflate';

  interface PackRecord {
    type: string;
    name: string;
    contents: string;
  }

  let records = $state<PackRecord[]>([
    {
      type: 'bitcoin output script descriptor',
      name: 'main wallet',
      contents: 'wpkh([d34db33f/84h/0h/0h]xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSojawudHrDrJm7VafwdeFaseB/0/*)',
    },
    {
      type: 'bitcoin wallet labels',
      name: 'my labels',
      contents: '{"type":"addr","ref":"bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4","label":"savings"}\n{"type":"tx","ref":"f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16","label":"first purchase"}',
    },
    {
      type: 'bitcoin psbt',
      name: 'unsigned tx',
      contents: 'cHNidP8BAHUCAAAAASaBcTce3/KFHeE2a6QAHfxqcrxfHGgG7vid5hU+nQITAAAAAAD+////AomN1gUAAAAA',
    },
  ]);

  const DATA_LENGTH = 6487;

  let rawBytes = $derived.by(() => {
    const encoder = new TextEncoder();
    let total = 0;
    for (const r of records) {
      total += encoder.encode(r.type).length + 1 + encoder.encode(r.name).length + 1 + encoder.encode(r.contents).length + 1;
    }
    return total;
  });

  let compressedBytes = $derived.by(() => {
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    for (const r of records) {
      parts.push(encoder.encode(r.type), new Uint8Array([0]),
                 encoder.encode(r.name), new Uint8Array([0]),
                 encoder.encode(r.contents), new Uint8Array([0]));
    }
    const raw = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let off = 0;
    for (const p of parts) { raw.set(p, off); off += p.length; }
    const gz = gzipSync(raw, { level: 9 });
    gz[4] = 0; gz[5] = 0; gz[6] = 0; gz[7] = 0;
    if (gz.length > 9) gz[9] = 0xff;
    return gz.length;
  });

  let fillPercent = $derived(Math.min(100, (compressedBytes / DATA_LENGTH) * 100));
  let overflow = $derived(compressedBytes > DATA_LENGTH);

  function removeRecord(i: number) {
    records = records.filter((_, idx) => idx !== i);
  }

  function addRecord() {
    records = [...records, { type: 'bitcoin miniscript', name: 'spending policy', contents: 'and_v(v:pk(02a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3),older(1000))' }];
  }

  const ACCEPTED = [
    'bitcoin psbt',
    'bitcoin transaction',
    'bitcoin miniscript',
    'bitcoin output script descriptor',
    'bitcoin wallet labels',
  ];
</script>

<div class="space-y-4">
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">Packing multiple records into one 8192-byte slot</h3>
    <p class="text-[11px] text-[#b1bac4] leading-relaxed">
      One centurymetadata slot holds <strong class="text-[#e6edf3]">6487 bytes</strong> of AES-encrypted data.
      But before encryption, multiple <code class="text-[#a371f7]">TYPE\0NAME\0CONTENTS\0</code> triples are concatenated
      and gzip-compressed together. This means a real wallet can store its descriptor + labels + pending PSBT all in one
      encrypted slot.
    </p>
  </div>

  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <div class="flex items-center justify-between mb-2">
      <h4 class="text-sm font-semibold text-[#e6edf3]">Records packed in this slot ({records.length})</h4>
      <button
        onclick={addRecord}
        data-testid="cm-pack-add"
        class="px-2 py-1 bg-[#238636] hover:bg-[#2ea043] text-white rounded-md text-[10px] font-medium"
      >+ Add record</button>
    </div>

    {#each records as r, i (i)}
      <div data-testid="cm-pack-record-{i}" class="bg-[#0d1117] border border-[#21262d] rounded-md p-3 space-y-2">
        <div class="flex items-center justify-between">
          <select bind:value={r.type} class="bg-[#161b22] border border-[#21262d] rounded px-2 py-1 text-[10px] font-mono text-[#a371f7]">
            {#each ACCEPTED as t}<option value={t}>{t}</option>{/each}
          </select>
          <button onclick={() => removeRecord(i)} class="text-[#484f58] hover:text-[#f85149] text-xs">✕</button>
        </div>
        <input bind:value={r.name} placeholder="record name" class="w-full bg-[#161b22] border border-[#21262d] rounded px-2 py-1 text-[10px] text-[#58a6ff] font-mono" />
        <textarea bind:value={r.contents} rows="2" class="w-full bg-[#161b22] border border-[#21262d] rounded px-2 py-1 text-[10px] font-mono text-[#e6edf3] resize-y"></textarea>
      </div>
    {/each}
  </div>

  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3" data-testid="cm-pack-budget">
    <h4 class="text-sm font-semibold text-[#e6edf3]">Byte budget</h4>

    <div class="grid grid-cols-3 gap-3 text-center">
      <div>
        <div class="text-lg font-bold text-[#58a6ff]">{rawBytes}</div>
        <div class="text-[9px] text-[#484f58]">raw bytes (before gzip)</div>
      </div>
      <div>
        <div class="text-lg font-bold {overflow ? 'text-[#f85149]' : 'text-[#3fb950]'}">{compressedBytes}</div>
        <div class="text-[9px] text-[#484f58]">gzip-compressed bytes</div>
      </div>
      <div>
        <div class="text-lg font-bold text-[#484f58]">{DATA_LENGTH - compressedBytes}</div>
        <div class="text-[9px] text-[#484f58]">zero-padding bytes</div>
      </div>
    </div>

    <div class="relative h-6 bg-[#0d1117] rounded-md border border-[#21262d] overflow-hidden">
      <div
        class="h-full transition-all duration-300 {overflow ? 'bg-[#f85149]' : 'bg-gradient-to-r from-[#3fb950] to-[#58a6ff]'}"
        style="width: {Math.min(100, fillPercent)}%;"
      ></div>
      <div class="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-[#e6edf3]">
        {fillPercent.toFixed(1)}% of {DATA_LENGTH} bytes
      </div>
    </div>

    {#if overflow}
      <div class="bg-[#f85149]/10 border border-[#f85149]/40 rounded-md p-2">
        <p class="text-[10px] text-[#f85149]">
          ✗ Compressed data exceeds the {DATA_LENGTH}-byte budget by {compressedBytes - DATA_LENGTH} bytes.
          The server would reject this record. Remove or shorten some contents.
        </p>
      </div>
    {:else}
      <p class="text-[10px] text-[#3fb950]">
        ✓ Fits with {DATA_LENGTH - compressedBytes} bytes to spare ({((DATA_LENGTH - compressedBytes) / DATA_LENGTH * 100).toFixed(1)}% empty padding).
      </p>
    {/if}
  </div>

  <div class="bg-[#1c2128] border border-[#30363d] rounded-lg p-4">
    <p class="text-[10px] text-[#8b949e] leading-relaxed">
      <strong class="text-[#e6edf3]">💡 How packing works:</strong>
      Each record is serialized as <code class="text-[#a371f7]">TYPE\0NAME\0CONTENTS\0</code> (UTF-8, NUL-separated).
      All triples are concatenated, then gzip-compressed (level 9, mtime=0, OS=0xff for reproducibility).
      The compressed data is zero-padded to exactly {DATA_LENGTH} bytes, then AES-256-CTR encrypted.
      The gzip compression ratio means even a large descriptor + labels + PSBT typically fits in well under 6KB.
    </p>
  </div>
</div>
