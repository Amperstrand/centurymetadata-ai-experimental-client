<script lang="ts">
  import CenturyMetadata from './components/CenturyMetadata.svelte';
</script>

<div class="min-h-screen bg-[#0d1117] text-[#e6edf3]">
  <header class="border-b border-[#21262d] px-4 py-3 max-w-5xl mx-auto flex items-center justify-between">
    <div class="flex items-center gap-3 min-w-0">
      <a href="/" class="text-sm sm:text-base font-bold text-[#a371f7] whitespace-nowrap">centurymetadata</a>
      <span class="text-[10px] text-[#484f58] hidden sm:inline">experimental learning client</span>
    </div>
    <div class="flex items-center gap-4 text-xs flex-shrink-0">
      <a
        href="https://github.com/Amperstrand/centurymetadata-ai-experimental-client"
        target="_blank"
        rel="noopener"
        class="text-[#8b949e] hover:text-[#e6edf3] hover:underline flex items-center gap-1"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        <span>source</span>
      </a>
    </div>
  </header>
  <main class="max-w-5xl mx-auto px-4 py-6">
    <CenturyMetadata />
  </main>
</div>
