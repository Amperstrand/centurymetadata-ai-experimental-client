<script lang="ts">
  import {
    encodeRecord, authorizeWriter, uploadRecord, fetchSlots,
    getMaxGeneration, decodeSlot, toHex,
  } from '../lib/centurymetadata';
  import type { CmKeys, DecodedSlot } from '../lib/centurymetadata';

  let { keys }: { keys: CmKeys } = $props();

  let title = $state('my note');
  let content = $state('encrypted at the edge');
  let writeStatus = $state('');
  let writing = $state(false);
  let writeOk = $state<boolean | null>(null);

  let records = $state<{ slot: Uint8Array; decoded: DecodedSlot }[]>([]);
  let fetching = $state(false);
  let fetchError = $state('');

  async function handleWrite() {
    writing = true;
    writeStatus = '';
    writeOk = null;
    try {
      const existing = await fetchSlots(keys.readerId);
      const gen = getMaxGeneration(existing, keys.writerPubKey) + 1n;
      const enc = await encodeRecord(keys, title, content, gen);
      const auth = await authorizeWriter(keys.readerId, keys.writerPubKey);
      const up = await uploadRecord(enc.fullRecord);
      writeOk = up.ok;
      writeStatus =
        `Upload: HTTP ${up.status} ${up.ok ? 'OK' : 'FAILED'}\n` +
        `generation=${Number(gen)} (auto-incremented from ${Number(gen - 1n)})\n` +
        `authorize: HTTP ${auth.status}\n${up.text?.slice(0, 120) ?? ''}`;
    } catch (e) {
      writeOk = false;
      writeStatus = 'Upload: error — ' + (e instanceof Error ? e.message : String(e));
    } finally {
      writing = false;
    }
  }

  async function handleFetch() {
    fetching = true;
    fetchError = '';
    records = [];
    try {
      const slots = await fetchSlots(keys.readerId);
      const decoded: { slot: Uint8Array; decoded: DecodedSlot }[] = [];
      for (const slot of slots) {
        try {
          const d = await decodeSlot(keys, slot);
          decoded.push({ slot, decoded: d });
        } catch {
          // skip undecodable (e.g. foreign/garbage) slots silently
        }
      }
      records = decoded;
      if (decoded.length === 0) fetchError = 'No records found for your reader_id.';
    } catch (e) {
      fetchError = 'Fetch failed — ' + (e instanceof Error ? e.message : String(e));
    } finally {
      fetching = false;
    }
  }
</script>

<div class="space-y-4">
  <div class="bg-[#0d1117] border border-[#21262d] rounded-lg p-3">
    <p class="text-[10px] text-[#484f58] font-mono break-all">your reader_id: <span class="text-[#a371f7]">{toHex(keys.readerId)}</span></p>
  </div>

  <!-- Write -->
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">Write an encrypted record</h3>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="block">
        <span class="text-[10px] text-[#8b949e] font-medium block mb-1">title</span>
        <input
          bind:value={title}
          data-testid="cm-write-title"
          class="w-full bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
        />
      </label>
      <label class="block">
        <span class="text-[10px] text-[#8b949e] font-medium block mb-1">content</span>
        <input
          bind:value={content}
          data-testid="cm-write-content"
          class="w-full bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
        />
      </label>
    </div>
    <button
      onclick={handleWrite}
      disabled={writing}
      data-testid="cm-write-btn"
      class="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#484f58] text-white rounded-md text-xs font-medium transition-colors"
    >
      {writing ? 'Encrypting + uploading…' : '▶ Encrypt & upload'}
    </button>
    {#if writeStatus}
      <pre data-testid="cm-write-status" class="text-[10px] font-mono whitespace-pre-wrap break-all bg-[#0d1117] border border-[#21262d] rounded-md p-2 {writeOk ? 'text-[#3fb950]' : writeOk === false ? 'text-[#f85149]' : 'text-[#8b949e]'}">{writeStatus}</pre>
    {/if}
  </div>

  <!-- Fetch + Decode -->
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-[#e6edf3]">Fetch & decrypt your records</h3>
      <button
        onclick={handleFetch}
        disabled={fetching}
        data-testid="cm-fetch-btn"
        class="px-3 py-1.5 bg-[#1f6feb] hover:bg-[#388bfd] disabled:bg-[#21262d] disabled:text-[#484f58] text-white rounded-md text-[11px] font-medium transition-colors"
      >
        {fetching ? 'Scanning bundle…' : '↻ Fetch + decode'}
      </button>
    </div>

    {#if fetchError}
      <p class="text-xs text-[#f85149]">{fetchError}</p>
    {/if}

    <div data-testid="cm-records" class="space-y-2">
      {#if records.length > 0}
        <p class="text-[11px] text-[#8b949e]">Found {records.length} record(s) for your reader_id:</p>
        {#each records as r, i (i)}
          <div data-testid="cm-record-{i}" class="border border-[#21262d] rounded-md p-3 bg-[#0d1117] space-y-1">
            <div class="flex items-center gap-2 flex-wrap text-[10px] font-mono">
              <span class="text-[#a371f7]">gen {r.decoded.generation}</span>
              <span class={r.decoded.sigValid ? 'text-[#3fb950]' : 'text-[#f85149]'}>
                sig {r.decoded.sigValid ? '✓ valid' : '✗ invalid'}
              </span>
            </div>
            {#if r.decoded.fields.length}
              {#each r.decoded.fields as [k, v] (k)}
                <div class="text-[11px]">
                  <span class="text-[#58a6ff] font-mono">{k}:</span>
                  <span class="text-[#e6edf3] break-all">{v}</span>
                </div>
              {/each}
            {:else}
              <span class="text-[10px] text-[#484f58]">(no decodable title\0content pairs)</span>
            {/if}
          </div>
        {/each}
      {:else if !fetching}
        <p class="text-[11px] text-[#484f58]">No records loaded yet — click “Fetch + decode”.</p>
      {/if}
    </div>
  </div>

  <div class="bg-[#1c2128] border border-[#30363d] rounded-lg p-3">
    <p class="text-[10px] text-[#8b949e] leading-relaxed">
      Records are encrypted <strong class="text-[#e6edf3]">in your browser</strong> before upload — the server only ever
      sees opaque bytes. Each write auto-increments the generation so you can update a record instead of being rejected.
      Data lives on the public <code class="text-[#a371f7]">testapi.centurymetadata.org</code> test API.
    </p>
  </div>
</div>
