<script lang="ts">
  import CenturyMetadata from './components/CenturyMetadata.svelte';
</script>

<div class="min-h-screen bg-[#0d1117] text-[#e6edf3]">
  <header class="border-b border-[#21262d] px-4 py-3 max-w-5xl mx-auto flex items-center justify-between">
    <a href="/" class="text-sm sm:text-base font-bold text-[#a371f7] whitespace-nowrap">centurymetadata</a>
    <span class="text-[10px] text-[#484f58]">experimental learning client</span>
  </header>
  <main class="max-w-5xl mx-auto px-4 py-6">
    <CenturyMetadata />
  </main>
</div>
