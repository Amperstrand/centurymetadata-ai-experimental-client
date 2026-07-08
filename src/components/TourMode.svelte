<script lang="ts">
  interface Section { id: string; num: number; label: string; icon: string; }

  let { sections, onNavigate }: { sections: Section[]; onNavigate: (id: string) => void } = $props();

  let active = $state(false);
  let idx = $state(0);

  function start() { active = true; idx = 0; onNavigate(sections[0].id); }
  function stop() { active = false; }
  function next() {
    if (idx < sections.length - 1) { idx++; onNavigate(sections[idx].id); }
    else { stop(); }
  }
  function prev() { if (idx > 0) { idx--; onNavigate(sections[idx].id); } }
</script>

{#if !active}
  <button
    data-testid="cm-tour-start"
    onclick={start}
    class="fixed bottom-4 right-4 z-40 px-4 py-2 bg-[#a371f7] hover:bg-[#bc8cff] text-white rounded-full text-xs font-medium shadow-lg transition-colors"
  >▶ Take the tour</button>
{:else}
  <div
    data-testid="cm-tour-banner"
    class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-[#161b22] border border-[#30363d] rounded-full px-4 py-2 flex items-center gap-3 shadow-xl"
  >
    <button data-testid="cm-tour-prev" onclick={prev} disabled={idx === 0} class="text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-30 text-sm">←</button>
    <div class="text-[11px] text-[#e6edf3] whitespace-nowrap">
      <span class="text-base mr-1">{sections[idx].icon}</span>
      <strong>{sections[idx].num}. {sections[idx].label}</strong>
      <span class="text-[#484f58] ml-2">{idx + 1}/{sections.length}</span>
    </div>
    <button data-testid="cm-tour-next" onclick={next} class="px-2 py-0.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded-full text-[11px] font-medium">
      {idx < sections.length - 1 ? 'Next →' : '✓ Done'}
    </button>
    <button onclick={stop} class="text-[#484f58] hover:text-[#f85149] text-xs ml-1">✕</button>
  </div>
{/if}
