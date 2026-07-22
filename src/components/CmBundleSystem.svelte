<script lang="ts">
  import { writerToColor } from '../lib/centurymetadata';
  import type { SlotPublic, NetworkStats } from '../lib/centurymetadata';

  let {
    networkSlots,
    networkStats,
    scanning,
    onRefresh,
  }: {
    networkSlots: SlotPublic[];
    networkStats: NetworkStats | null;
    scanning: boolean;
    onRefresh: () => void;
  } = $props();

  // scanNetwork() probes slot 0 of each bundle directory, so networkSlots is
  // sparse (a sample). Build an index->occupied-slot map; the grid renders all
  // 1024 cells and colours the few occupied ones.
  const occupiedByIndex = $derived.by(() => {
    const m = new Map<number, SlotPublic>();
    for (const s of networkSlots) {
      if (s.occupied && !m.has(s.index)) m.set(s.index, s);
    }
    return m;
  });

  let selectedIndex = $state<number | null>(null);
  let selected = $derived(selectedIndex === null ? null : occupiedByIndex.get(selectedIndex) ?? null);

  const TOTAL_CELLS = 1024;
  const cells = $derived(Array.from({ length: TOTAL_CELLS }, (_, i) => i));

  let utilization = $derived(
    networkStats && networkStats.totalSlots > 0
      ? ((networkStats.occupiedSlots / networkStats.totalSlots) * 100).toFixed(2)
      : '0',
  );
</script>

<div class="space-y-4">
  <!-- Stats -->
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4" data-testid="cm-bundle-stats">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold text-[#e6edf3]">Network sample</h3>
      <button
        onclick={onRefresh}
        disabled={scanning}
        data-testid="cm-bundle-refresh"
        class="px-2.5 py-1 bg-[#21262d] hover:bg-[#30363d] disabled:opacity-50 text-[#58a6ff] rounded-md text-[11px] font-medium transition-colors"
      >
        {scanning ? 'Scanning…' : '↻ Refresh'}
      </button>
    </div>

    {#if scanning && !networkStats}
      <div class="flex items-center gap-3 py-3">
        <div class="w-4 h-4 rounded-full border-2 border-[#21262d] border-t-[#58a6ff] animate-spin"></div>
        <span class="text-xs text-[#8b949e]">Probing the test bundle…</span>
      </div>
    {:else if networkStats}
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
        <div>
          <div class="text-lg font-bold text-[#58a6ff]">{networkStats.totalBundles}</div>
          <div class="text-[10px] text-[#484f58]">Bundles</div>
        </div>
        <div>
          <div class="text-lg font-bold text-[#e6edf3]">{networkStats.totalSlots}</div>
          <div class="text-[10px] text-[#484f58]">Slots probed</div>
        </div>
        <div>
          <div class="text-lg font-bold text-[#d29922]">{networkStats.occupiedSlots}</div>
          <div class="text-[10px] text-[#484f58]">Occupied</div>
        </div>
        <div>
          <div class="text-lg font-bold text-[#a371f7]">{networkStats.uniqueWriters}</div>
          <div class="text-[10px] text-[#484f58]">Unique writers</div>
        </div>
        <div>
          <div class="text-lg font-bold text-[#3fb950]">{utilization}%</div>
          <div class="text-[10px] text-[#484f58]">Utilization</div>
        </div>
      </div>
    {:else}
      <p class="text-xs text-[#8b949e] py-2">Couldn't reach the test API. Try refresh.</p>
    {/if}
  </div>

  <!-- Grid -->
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold text-[#e6edf3]">1024-slot bundle</h3>
      <span class="text-[10px] text-[#484f58]">scroll horizontally ←→ · click occupied cell</span>
    </div>
    <p class="text-[10px] text-[#484f58] md:hidden mb-2">↔ Pinch or scroll to explore the grid. Best viewed on desktop.</p>
    <div class="overflow-x-auto">
      <div
        data-testid="cm-slot-grid"
        class="grid grid-cols-[repeat(32,minmax(10px,1fr))] gap-[2px] bg-[#0d1117] p-2 rounded border border-[#21262d]"
        style="min-width: 360px;"
      >
      {#each cells as i (i)}
        {@const slot = occupiedByIndex.get(i) ?? null}
        <button
          data-testid="cm-slot-{i}"
          onclick={() => slot && (selectedIndex = i)}
          disabled={!slot}
          title={slot ? `slot ${i} · writer ${slot.writerPubkey?.slice(0, 10)}…` : `slot ${i} (empty)`}
          style={slot && slot.writerPubkey ? `background: ${writerToColor(slot.writerPubkey)};` : ''}
          class="aspect-square rounded-[2px] transition-transform {slot ? 'hover:scale-125 hover:z-10 cursor-pointer' : 'bg-[#161b22] cursor-default'}
            {selectedIndex === i ? 'ring-2 ring-[#f78166] ring-offset-1 ring-offset-[#0d1117]' : ''}"
        ></button>
      {/each}
      </div>
    </div>
    <div class="flex justify-between mt-2 text-[10px] text-[#484f58] font-mono">
      <span>slot 0</span>
      <span>slot 1023</span>
    </div>
  </div>

  <!-- Detail -->
  {#if selected}
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-2" data-testid="cm-slot-detail">
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-bold text-[#e6edf3]">Slot #{selectedIndex}</h4>
        <button onclick={() => (selectedIndex = null)} class="text-[#484f58] hover:text-[#e6edf3] text-xs">✕</button>
      </div>
      <div class="text-[11px] font-mono space-y-1.5">
        <div>
          <span class="text-[#484f58]">Writer:</span>
          <span class="text-[#58a6ff] break-all">{selected.writerPubkey}</span>
        </div>
        <div>
          <span class="text-[#484f58]">Reader ID:</span>
          <span class="text-[#a371f7] break-all">{selected.readerId}</span>
        </div>
        <div>
          <span class="text-[#484f58]">Generation:</span>
          <span class="text-[#3fb950]">{selected.generation}</span>
        </div>
      </div>
      <p class="text-[10px] text-[#8b949e] leading-relaxed pt-1">
        Only the cleartext fields are visible here. The encrypted payload
        (ML-KEM ciphertext + AES content) is opaque without the reader's private keys.
      </p>
    </div>
  {/if}

  <!-- XOR explainer -->
  <div class="bg-[#1c2128] border border-[#30363d] rounded-lg p-4">
    <h4 class="text-sm font-semibold text-[#e6edf3] mb-2">Privacy in numbers (XOR masking)</h4>
    <p class="text-xs text-[#8b949e] leading-relaxed">
      Records aren't fetched individually. A client sends a 128-byte <strong class="text-[#e6edf3]">bitmask</strong>
      (1024 bits — one bit per <em>bundle</em> in the directory, per upstream README "Retrieving Entries:
      POST /api/v1/fetchxor/{DIRECTORY}") and the server <strong class="text-[#e6edf3]">XORs</strong> the
      selected bundles together. A single-bit bitmask returns one raw 8 MB bundle (1024 × 8192-byte slots);
      multi-bit bitmaps mix bundles so the server can't tell which one you want. Everyone then scans the
      same 1024-slot result client-side — only your <code class="text-[#a371f7]">reader_id</code> lets you
      spot your slot.
    </p>
    <p class="text-[10px] text-[#484f58] mt-2">
      ⚠ This grid is a <em>sample</em>: the explorer probes bundle 0 of each directory (a full multi-bundle
      scan on every page load would be slow). The 1024 cells reflect the slots inside that one bundle, not
      the whole network.
    </p>
    <div class="mt-3 pt-3 border-t border-[#21262d]">
      <div class="text-[10px] text-[#d29922] font-mono mb-1">listbundles + fetchxor: how routing scales</div>
      <p class="text-[10px] text-[#8b949e] leading-relaxed">
        Records are routed to bundles by their <code class="text-[#a371f7]">reader_id</code> hex prefix. The
        <code class="text-[#58a6ff]">GET /api/v1/listbundles</code> endpoint returns the directory/bundle layout
        with each bundle's 0-based <code class="text-[#a371f7]">index</code> — the bit position to set in the
        128-byte <code class="text-[#a371f7]">fetchxor</code> bitmask. At launch there is one bundle at index 0;
        as the network grows past 1024 records per bundle it splits into two halves named by the minimal
        distinct hex prefix. Directories split the same way once they exceed 1024 bundles, so the bitmask
        always covers the current set of bundles in a directory.
      </p>
    </div>
    <div class="mt-3 pt-3 border-t border-[#21262d]">
      <div class="text-[10px] text-[#d29922] font-mono mb-1">bundle splitting: the scaling mechanism</div>
      <p class="text-[10px] text-[#8b949e] leading-relaxed mb-2">
        When a bundle exceeds 1024 records, it splits in half. Each half is named by the shortest hex prefix that
        distinguishes their reader_ids. Directories split the same way when they exceed 1024 bundles.
      </p>
      <pre class="text-[9px] text-[#8b949e] font-mono leading-relaxed overflow-x-auto bg-[#0d1117] rounded-md p-2">
Before split (1024+ records):       After split:
┌─────────────────────────┐        ┌──────────┐ ┌──────────┐
│ 00-ff/                  │   →    │ 00-7f/   │ │ 80-ff/   │
│   00-ff/                │        │   00-7f/ │ │   80-ff/ │
│     1024 slots          │        │   ~512   │ │   ~512   │
└─────────────────────────┘        └──────────┘ └──────────┘
      </pre>
    </div>
  </div>
</div>
