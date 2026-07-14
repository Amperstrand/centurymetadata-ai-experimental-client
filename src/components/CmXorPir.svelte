<script lang="ts">
  let step = $state(0);
  let running = $state(false);

  const NUM_SLOTS = 8;
  const TARGET = 3;

  const SLOTS: string[] = [
    '00 00 00 00',
    '00 00 00 00',
    '00 00 00 00',
    'de ad be ef',
    '00 00 00 00',
    'ca fe ba de',
    '00 00 00 00',
    '00 00 00 00',
  ];

  let maskA = $state<number[]>(Array(NUM_SLOTS).fill(0));
  let maskB = $state<number[]>(Array(NUM_SLOTS).fill(0));
  let responseA = $state<string[]>(Array(NUM_SLOTS).fill('00 00 00 00'));
  let responseB = $state<string[]>(Array(NUM_SLOTS).fill('00 00 00 00'));
  let xorResult = $state<string[]>(Array(NUM_SLOTS).fill('00 00 00 00'));

  function xorHex(a: string, b: string): string {
    const ba = a.split(' ').map(h => parseInt(h, 16));
    const bb = b.split(' ').map(h => parseInt(h, 16));
    return ba.map((byte, i) => (byte ^ bb[i]).toString(16).padStart(2, '0')).join(' ');
  }

  function xorSlots(slots: string[], mask: number[]): string[] {
    let acc = '00 00 00 00';
    for (let i = 0; i < slots.length; i++) {
      if (mask[i]) acc = xorHex(acc, slots[i]);
    }
    return Array(NUM_SLOTS).fill('00 00 00 00').map((_, i) => {
      return mask[i] ? slots[i] : '00 00 00 00';
    }).concat([]).slice(0, 0).length >= 0 ? Array(NUM_SLOTS).fill(acc) : [];
  }

  function buildXorResult(slots: string[], mask: number[]): string[] {
    let acc = [0, 0, 0, 0];
    for (let i = 0; i < slots.length; i++) {
      if (mask[i]) {
        const bytes = slots[i].split(' ').map(h => parseInt(h, 16));
        acc = acc.map((b, j) => b ^ bytes[j]);
      }
    }
    const accHex = acc.map(b => b.toString(16).padStart(2, '0')).join(' ');
    return Array(NUM_SLOTS).fill(accHex);
  }

  function runDemo() {
    if (running) return;
    running = true;
    step = 0;

    const m = Array(NUM_SLOTS).fill(0);
    m[TARGET] = 1;
    const decoys = [1, 5];
    for (const d of decoys) m[d] = 1;
    maskA = [...m];
    maskB = m.map((b, i) => i === TARGET ? 1 - b : b);

    setTimeout(() => { step = 1; }, 600);
    setTimeout(() => { step = 2; }, 1400);
    setTimeout(() => {
      step = 3;
      responseA = buildXorResult(SLOTS, maskA);
    }, 2200);
    setTimeout(() => {
      step = 4;
      responseB = buildXorResult(SLOTS, maskB);
    }, 3000);
    setTimeout(() => {
      step = 5;
      const a = responseA[0];
      const b = responseB[0];
      xorResult = Array(NUM_SLOTS).fill(xorHex(a, b));
      running = false;
    }, 3800);
  }
</script>

<div class="space-y-4">
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">Privacy in numbers: XOR-masked retrieval</h3>
    <p class="text-[11px] text-[#b1bac4] leading-relaxed">
      When you fetch your record, the server shouldn't know <em>which</em> slot is yours. centurymetadata solves this with
      XOR-PIR: you query <strong class="text-[#e6edf3]">two servers</strong> with complementary bitmasks. Each server sees
      a different-looking request. XOR their responses, and only your slot survives.
    </p>
    <button
      onclick={runDemo}
      disabled={running}
      data-testid="cm-xorpir-run"
      class="px-4 py-2 bg-[#1f6feb] hover:bg-[#388bfd] disabled:bg-[#21262d] disabled:text-[#484f58] text-white rounded-md text-xs font-medium transition-colors"
    >
      {running ? `Step ${step}/5…` : '▶ Run privacy demo'}
    </button>
  </div>

  {#if step >= 1}
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
      <h4 class="text-sm font-semibold text-[#e6edf3]">Step 1: The bundle (8 slots shown, real bundles have 1024)</h4>
      <div class="grid grid-cols-4 gap-2" data-testid="cm-xorpir-slots">
        {#each SLOTS as slot, i}
          <div class="rounded p-2 text-center text-[10px] font-mono border {i === TARGET
            ? 'bg-[#f78166]/20 border-[#f78166] text-[#f78166]'
            : slot === '00 00 00 00'
              ? 'bg-[#0d1117] border-[#21262d] text-[#484f58]'
              : 'bg-[#0d1117] border-[#21262d] text-[#d29922]'}">
            <div class="text-[9px] text-[#484f58] mb-0.5">slot {i}</div>
            {slot}
            {#if i === TARGET}<div class="text-[8px] text-[#f78166] mt-0.5">YOUR RECORD</div>{/if}
          </div>
        {/each}
      </div>
      <p class="text-[10px] text-[#8b949e]">Slot {TARGET} contains your encrypted record. Slots 1 and 5 belong to other users.</p>
    </div>
  {/if}

  {#if step >= 2}
    <div class="grid sm:grid-cols-2 gap-3">
      <div class="bg-[#161b22] border border-[#3fb950]/40 rounded-lg p-4 space-y-2">
        <h4 class="text-[11px] text-[#3fb950] font-semibold">Server A receives mask R</h4>
        <div class="flex gap-1" data-testid="cm-xorpir-mask-a">
          {#each maskA as bit, i}
            <div class="w-8 h-8 rounded flex items-center justify-center text-[10px] font-mono font-bold {bit
              ? 'bg-[#3fb950]/30 text-[#3fb950] border border-[#3fb950]'
              : 'bg-[#0d1117] text-[#484f58] border border-[#21262d]'}">
              {bit}
            </div>
          {/each}
        </div>
        <p class="text-[10px] text-[#8b949e]">Bits set: {maskA.filter(b => b).length}. Server A XORs slots {[...maskA.entries()].filter(([,b]) => b).map(([i]) => i).join(', ')}.</p>
      </div>

      <div class="bg-[#161b22] border border-[#a371f7]/40 rounded-lg p-4 space-y-2">
        <h4 class="text-[11px] text-[#a371f7] font-semibold">Server B receives mask R ⊕ target</h4>
        <div class="flex gap-1" data-testid="cm-xorpir-mask-b">
          {#each maskB as bit, i}
            <div class="w-8 h-8 rounded flex items-center justify-center text-[10px] font-mono font-bold {bit
              ? 'bg-[#a371f7]/30 text-[#a371f7] border border-[#a371f7]'
              : 'bg-[#0d1117] text-[#484f58] border border-[#21262d]'}">
              {bit}
            </div>
          {/each}
        </div>
        <p class="text-[10px] text-[#8b949e]">Bits set: {maskB.filter(b => b).length}. Bit {TARGET} is <strong>flipped</strong> — Server B never sees it set.</p>
      </div>
    </div>
    <p class="text-[10px] text-[#d29922] text-center">
      Neither server sees only bit {TARGET}. Each request looks like it's asking for multiple random slots.
    </p>
  {/if}

  {#if step >= 3}
    <div class="grid sm:grid-cols-2 gap-3">
      <div class="bg-[#161b22] border border-[#3fb950]/40 rounded-lg p-3">
        <div class="text-[10px] text-[#3fb950] mb-1">Server A response (XOR of selected slots)</div>
        <div data-testid="cm-xorpir-response-a" class="text-[11px] font-mono text-[#e6edf3] bg-[#0d1117] rounded px-2 py-1 break-all">
          {responseA[0]}
        </div>
      </div>
      <div class="bg-[#161b22] border border-[#a371f7]/40 rounded-lg p-3">
        <div class="text-[10px] text-[#a371f7] mb-1">Server B response (XOR of selected slots)</div>
        <div data-testid="cm-xorpir-response-b" class="text-[11px] font-mono text-[#e6edf3] bg-[#0d1117] rounded px-2 py-1 break-all">
          {responseB[0]}
        </div>
      </div>
    </div>
  {/if}

  {#if step >= 5}
    <div class="bg-[#161b22] border border-[#f78166] rounded-lg p-4 space-y-2">
      <h4 class="text-sm font-semibold text-[#f78166]">Step 5: Client XORs the two responses</h4>
      <div data-testid="cm-xorpir-result" class="text-[11px] font-mono bg-[#0d1117] rounded p-3 space-y-1">
        <div class="text-[#3fb950]">Server A: {responseA[0]}</div>
        <div class="text-[#a371f7]">Server B: {responseB[0]}</div>
        <div class="text-[#484f58]">────────────────────</div>
        <div class="text-[#f78166] font-bold">XOR:      {xorResult[0]}</div>
      </div>
      <div class="bg-[#f78166]/10 rounded p-2">
        <p class="text-[10px] text-[#f78166]">
          ✓ The result matches slot {TARGET} (<code class="font-mono">{SLOTS[TARGET]}</code>).
          The decoy slots (1 and 5) appeared in <strong>both</strong> responses, so they cancelled out in the XOR.
          Only the target slot appeared in exactly one response — it survived.
        </p>
      </div>
    </div>
  {/if}

  {#if step >= 5}
    <div class="bg-[#1c2128] border border-[#30363d] rounded-lg p-4">
      <p class="text-[10px] text-[#8b949e] leading-relaxed">
        <strong class="text-[#e6edf3]">💡 Why this works:</strong>
        Slot {TARGET} was requested from Server A (bit set) but NOT from Server B (bit flipped).
        Every other requested slot appeared in both responses. XOR is self-cancelling:
        <code class="text-[#a371f7]">A ⊕ A = 0</code>, so anything in both responses vanishes.
        Only the difference (slot {TARGET}) remains. Neither server individually knows which slot was the target —
        each saw a bitmask with multiple bits set.
      </p>
    </div>
  {/if}
</div>
