<script lang="ts">
  import { deriveNostrKeys, npubEncode, signNote, verifyNoteId } from '../lib/nostr';
  import { deriveCmKeys, toHex } from '../lib/centurymetadata';

  let { mnemonic }: { mnemonic: string } = $props();

  let nostr = $derived(deriveNostrKeys(mnemonic));
  let cm = $derived(deriveCmKeys(mnemonic));
  let npub = $derived(npubEncode(nostr.pubKeyXOnly));

  let noteContent = $state('hello from one seed, two identities');
  let signed = $state<ReturnType<typeof signNote> | null>(null);
  let signing = $state(false);

  function handleSign() {
    signing = true;
    try {
      signed = signNote(nostr.privKey, nostr.pubKeyXOnly, noteContent);
    } finally {
      signing = false;
    }
  }
</script>

<div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
  <div class="flex items-center gap-2">
    <span class="text-lg">🔗</span>
    <h3 class="text-sm font-semibold text-[#e6edf3]">Live bridge — one seed, two identities</h3>
  </div>
  <p class="text-[11px] text-[#8b949e] leading-relaxed">
    Both identities below are derived from the <em>same</em> BIP-39 mnemonic: a Nostr identity (NIP-06
    <code class="text-[#3fb950]">m/44'/1237'/0'/0/0</code>) and a centurymetadata identity (<code class="text-[#a371f7]">m/0x44315441'/0'/…</code>).
    They share a seed yet are cryptographically independent.
  </p>

  <div class="grid sm:grid-cols-2 gap-3">
    <!-- Nostr -->
    <div class="bg-[#0d1117] border border-[#21262d] rounded-md p-3 space-y-1">
      <div class="flex items-center gap-2">
        <span class="text-[#3fb950] text-xs font-semibold">Nostr identity</span>
        <span class="text-[9px] text-[#484f58] font-mono">NIP-06</span>
      </div>
      <div class="text-[10px] text-[#484f58] font-mono">npub</div>
      <div class="text-[10px] text-[#3fb950] font-mono break-all bg-[#161b22] rounded px-2 py-1">{npub.slice(0, 48)}…</div>
      <div class="text-[10px] text-[#484f58] font-mono">pubkey (x-only, hex)</div>
      <div class="text-[10px] text-[#58a6ff] font-mono break-all bg-[#161b22] rounded px-2 py-1">{toHex(nostr.pubKeyXOnly).slice(0, 48)}…</div>
    </div>

    <!-- centurymetadata -->
    <div class="bg-[#0d1117] border border-[#21262d] rounded-md p-3 space-y-1">
      <div class="flex items-center gap-2">
        <span class="text-[#a371f7] text-xs font-semibold">centurymetadata identity</span>
        <span class="text-[9px] text-[#484f58] font-mono">"D1TA"</span>
      </div>
      <div class="text-[10px] text-[#484f58] font-mono">reader_id</div>
      <div class="text-[10px] text-[#a371f7] font-mono break-all bg-[#161b22] rounded px-2 py-1">{toHex(cm.readerId).slice(0, 48)}…</div>
      <div class="text-[10px] text-[#484f58] font-mono">writer_pubkey</div>
      <div class="text-[10px] text-[#58a6ff] font-mono break-all bg-[#161b22] rounded px-2 py-1">{toHex(cm.writerPubKey).slice(0, 48)}…</div>
    </div>
  </div>

  <!-- Prove the Nostr identity is real: sign a kind-1 note -->
  <div class="bg-[#0d1117] border border-[#21262d] rounded-md p-3 space-y-2">
    <div class="text-[11px] text-[#8b949e]">Prove the Nostr key works — sign a kind-1 note (no relay broadcast, just sign + verify):</div>
    <div class="flex gap-2 flex-wrap">
      <input
        bind:value={noteContent}
        data-testid="cm-note-input"
        placeholder="note content"
        class="flex-1 min-w-[200px] bg-[#161b22] border border-[#21262d] rounded-md px-3 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
      />
      <button
        onclick={handleSign}
        disabled={signing}
        data-testid="cm-note-sign"
        class="px-3 py-1.5 bg-[#1f6feb] hover:bg-[#388bfd] disabled:bg-[#21262d] disabled:text-[#484f58] text-white rounded-md text-[11px] font-medium transition-colors"
      >✍ Sign</button>
    </div>
    {#if signed}
      <div class="space-y-1" data-testid="cm-note-result">
        <div class="text-[10px] font-mono {verifyNoteId(signed) ? 'text-[#3fb950]' : 'text-[#f85149]'}">
          id valid: {verifyNoteId(signed) ? '✓ yes' : '✗ no'} · sig {signed.sig.length} hex chars
        </div>
        <pre class="text-[9px] font-mono whitespace-pre-wrap break-all bg-[#161b22] border border-[#21262d] rounded-md p-2 text-[#8b949e]">{JSON.stringify(signed, null, 2)}</pre>
      </div>
    {/if}
  </div>
</div>
