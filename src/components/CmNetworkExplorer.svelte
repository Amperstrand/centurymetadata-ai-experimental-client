<script lang="ts">
  import { scanNetwork, checkSignature, toHex } from '../lib/centurymetadata';
  import type { SlotPublic, NetworkStats } from '../lib/centurymetadata';
  import type { CmKeys } from '../lib/centurymetadata';

  let { keys }: { keys: CmKeys } = $props();

  let slots = $state<SlotPublic[]>([]);
  let stats = $state<NetworkStats | null>(null);
  let loading = $state(false);
  let loaded = $state(false);

  async function scan() {
    loading = true;
    try {
      const result = await scanNetwork();
      slots = result.slots.filter(s => s.occupied);
      stats = result.stats;
      loaded = true;
    } catch {
      slots = [];
    }
    loading = false;
  }

  $effect(() => {
    scan();
  });

  let ourReaderIdHex = $derived(toHex(keys.readerId));
</script>

<div class="space-y-4">
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-[#e6edf3]">Live network data</h3>
      <button
        onclick={scan}
        disabled={loading}
        data-testid="cm-explorer-refresh"
        class="px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] disabled:opacity-50 text-[#58a6ff] rounded-md text-[11px] font-medium transition-colors"
      >
        {loading ? 'Scanning…' : '↻ Refresh'}
      </button>
    </div>

    {#if loading && !loaded}
      <div class="flex items-center gap-3 py-3">
        <div class="w-4 h-4 rounded-full border-2 border-[#21262d] border-t-[#58a6ff] animate-spin"></div>
        <span class="text-xs text-[#8b949e]">Fetching 8 MB bundle from test API…</span>
      </div>
    {:else if stats}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div>
          <div class="text-lg font-bold text-[#e6edf3]">{stats.totalSlots}</div>
          <div class="text-[10px] text-[#484f58]">total slots</div>
        </div>
        <div>
          <div class="text-lg font-bold text-[#d29922]">{stats.occupiedSlots}</div>
          <div class="text-[10px] text-[#484f58]">occupied</div>
        </div>
        <div>
          <div class="text-lg font-bold text-[#a371f7]">{stats.uniqueWriters}</div>
          <div class="text-[10px] text-[#484f58]">unique writers</div>
        </div>
        <div>
          <div class="text-lg font-bold text-[#3fb950]">{((stats.occupiedSlots / stats.totalSlots) * 100).toFixed(2)}%</div>
          <div class="text-[10px] text-[#484f58]">occupancy</div>
        </div>
      </div>
    {/if}
  </div>

  {#if loaded && slots.length > 0}
    <div class="space-y-2" data-testid="cm-explorer-records">
      <p class="text-[11px] text-[#8b949e]">{slots.length} occupied record(s) found. These are the cleartext fields only — the encrypted payload is opaque without the reader's private keys.</p>

      {#each slots as s, i (i)}
        <div
          data-testid="cm-explorer-record-{i}"
          class="bg-[#161b22] border rounded-lg p-3 space-y-2 {s.readerId === ourReaderIdHex.slice(0, s.readerId?.length) ? 'border-[#f78166]' : 'border-[#21262d]'}"
        >
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2 text-[10px] font-mono">
              <span class="text-[#484f58]">slot {s.index}</span>
              {#if s.readerId === ourReaderIdHex.slice(0, s.readerId?.length)}
                <span class="text-[#f78166] bg-[#f78166]/10 px-1.5 py-0.5 rounded-full text-[9px]">YOURS</span>
              {/if}
              <span class="text-[#a371f7]">gen {s.generation}</span>
            </div>
          </div>
          <div class="grid sm:grid-cols-2 gap-2 text-[10px] font-mono">
            <div>
              <span class="text-[#484f58]">writer:</span>
              <span class="text-[#58a6ff] break-all">{s.writerPubkey?.slice(0, 40)}…</span>
            </div>
            <div>
              <span class="text-[#484f58]">reader:</span>
              <span class="text-[#a371f7] break-all">{s.readerId?.slice(0, 40)}…</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else if loaded && slots.length === 0}
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 text-center">
      <p class="text-xs text-[#8b949e]">No occupied records found. The test server bundle is empty.</p>
    </div>
  {/if}

  <div class="bg-[#1c2128] border border-[#30363d] rounded-lg p-4">
    <p class="text-[10px] text-[#8b949e] leading-relaxed">
      <strong class="text-[#e6edf3]">💡 What you're seeing:</strong>
      The test API serves a single 8 MB bundle containing 1024 × 8192-byte slots. Most slots are empty (zeroed).
      Each occupied slot has cleartext fields (writer pubkey, reader_id, generation) and encrypted fields
      (ML-KEM ciphertext + AES payload). Anyone can read the cleartext fields and verify the BIP-340 signature —
      but only the reader with the matching private keys can decrypt the content.
    </p>
  </div>
</div>
