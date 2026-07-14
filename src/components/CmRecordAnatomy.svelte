<script lang="ts">
  import { preambleText, preambleLength } from '../lib/centurymetadata';

  let selectedField = $state<string | null>('sig');

  interface Field {
    id: string;
    name: string;
    size: number;
    color: string;
    encrypted: boolean;
    desc: string;
    detail: string;
  }

  const fields: Field[] = [
    {
      id: 'sig',
      name: 'SIG',
      size: 64,
      color: '#f85149',
      encrypted: false,
      desc: 'BIP-340 Schnorr Signature',
      detail: 'A 64-byte Schnorr signature over SHA256(TAG ∥ TAG ∥ WRITER_PUBKEY ∥ READER_ID ∥ GEN ∥ MLKEM_CT ∥ AES). Anyone can verify this proves the writer authored the record.',
    },
    {
      id: 'writer',
      name: 'WRITER_PUBKEY',
      size: 33,
      color: '#58a6ff',
      encrypted: false,
      desc: 'Writer\'s Public Key',
      detail: '33-byte compressed secp256k1 public key. Identifies who wrote this record. Used for signature verification and ECDH key exchange.',
    },
    {
      id: 'reader',
      name: 'READER_ID',
      size: 32,
      color: '#a371f7',
      encrypted: false,
      desc: 'Reader ID (address)',
      detail: 'SHA256(reader_secp_pubkey ∥ reader_mlkem_pubkey). This is the recipient\'s address — how the system knows which slot belongs to whom.',
    },
    {
      id: 'gen',
      name: 'GEN',
      size: 8,
      color: '#3fb950',
      encrypted: false,
      desc: 'Generation Number',
      detail: '8-byte big-endian integer. Writers can update records — higher generations supersede lower ones. Only the latest generation is served in the bundle.',
    },
    {
      id: 'mlkem',
      name: 'MLKEM_CT',
      size: 1568,
      color: '#d29922',
      encrypted: true,
      desc: 'ML-KEM-1024 Ciphertext (Post-Quantum)',
      detail: '1568-byte ciphertext from ML-KEM-1024 (FIPS 203) key encapsulation. Contains a 32-byte post-quantum shared secret that only the reader\'s ML-KEM private key can decapsulate.',
    },
    {
      id: 'aes',
      name: 'AES',
      size: 6487,
      color: '#21262d',
      encrypted: true,
      desc: 'AES-256-CTR Encrypted Payload',
      detail: 'The actual record content (title\\0content pairs), gzip-compressed, zero-padded to 6487 bytes, then encrypted with AES-256-CTR using SHA256(ECDH_secret ∥ MLKEM_secret) as the key.',
    },
  ];

  const TOTAL = 8192;

  function pct(size: number) {
    return (size / TOTAL) * 100;
  }

  let selected = $derived(fields.find(f => f.id === selectedField));
</script>

<div class="space-y-4">
  <!-- Proportional bar visualization -->
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold text-[#e6edf3]">8192-byte Slot Layout</h3>
      <span class="text-[10px] text-[#484f58]">click a field to explore</span>
    </div>
    <div class="flex h-12 rounded-md overflow-hidden border border-[#21262d]">
      {#each fields as f}
        <button
          data-testid="cm-field-{f.id}"
          onclick={() => selectedField = f.id}
          style="width: {pct(f.size)}%; background: {f.color};"
          class="hover:opacity-80 transition-opacity flex items-center justify-center border-r border-[#0d1117] last:border-r-0 {selectedField === f.id ? 'ring-2 ring-[#f78166] ring-inset z-10' : ''}"
          title="{f.name} [{f.size} bytes]"
        >
          {#if pct(f.size) > 5}
            <span class="text-[9px] font-mono font-bold text-white truncate px-1">{f.name}</span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="flex justify-between mt-1 text-[10px] text-[#484f58] font-mono">
      <span>byte 0</span>
      <span>byte 8192</span>
    </div>
  </div>

  <!-- Field sizes breakdown -->
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
    <h3 class="text-sm font-semibold text-[#e6edf3] mb-3">Field Breakdown</h3>
    <div class="space-y-1">
      {#each fields as f}
        <button
          data-testid="cm-field-list-{f.id}"
          onclick={() => selectedField = f.id}
          class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors text-left
            {selectedField === f.id ? 'bg-[#21262d]' : 'hover:bg-[#1c2128]'}"
        >
          <div class="w-3 h-3 rounded-sm flex-shrink-0" style="background: {f.color}"></div>
          <span class="font-mono text-[#e6edf3] w-32 flex-shrink-0">{f.name}</span>
          <span class="text-[#8b949e] w-16 flex-shrink-0">{f.size} bytes</span>
          <span class="text-[#484f58] flex-1 truncate">{f.desc}</span>
          {#if f.encrypted}
            <span class="text-[9px] text-[#d29922] bg-[#d29922]/10 px-1.5 py-0.5 rounded-full flex-shrink-0">🔒 encrypted</span>
          {:else}
            <span class="text-[9px] text-[#3fb950] bg-[#3fb950]/10 px-1.5 py-0.5 rounded-full flex-shrink-0">👁 cleartext</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Selected field detail -->
  {#if selected}
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-2" data-testid="cm-field-detail">
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 rounded-sm" style="background: {selected.color}"></div>
        <h4 class="text-sm font-bold text-[#e6edf3]">{selected.name}</h4>
        <span class="text-[10px] text-[#484f58] font-mono">{selected.size} bytes</span>
      </div>
      <p class="text-xs text-[#8b949e] leading-relaxed">{selected.detail}</p>
    </div>
  {/if}

  <!-- Key insight -->
  <div class="bg-[#1c2128] border border-[#30363d] rounded-lg p-4">
    <p class="text-xs text-[#8b949e] leading-relaxed">
      <strong class="text-[#e6edf3]">💡 Notice:</strong>
      Only <strong class="text-[#3fb950]">137 bytes</strong> are cleartext (SIG + WRITER + READER + GEN).
      The remaining <strong class="text-[#d29922]">8055 bytes</strong> (98.3%) are encrypted.
      Anyone scanning the bundle can see <em>who</em> wrote a record, <em>who</em> it's for, and <em>what generation</em> it is —
      but the actual content is cryptographically opaque.
    </p>
  </div>

  <!-- Preamble: self-documenting header -->
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <div class="flex items-center gap-2">
      <span class="text-lg">📜</span>
      <h3 class="text-sm font-semibold text-[#e6edf3]">The Preamble: a self-documenting record</h3>
    </div>
    <p class="text-[11px] text-[#b1bac4] leading-relaxed">
      Every centurymetadata record begins with a human-readable <strong class="text-[#e6edf3]">preamble</strong> — a
      text header that describes the entire format. A future developer who finds this record in 100 years can understand
      how to decode it <em>just from the preamble itself</em>. No external documentation needed. The server strips the
      preamble before storing the 8192-byte slot, but it validates the record matches this specification on upload.
    </p>
    <details>
      <summary class="text-[10px] text-[#58a6ff] cursor-pointer hover:underline">Show full preamble text ({preambleLength()} bytes)</summary>
      <pre data-testid="cm-preamble" class="text-[9px] text-[#8b949e] font-mono leading-relaxed overflow-x-auto bg-[#0d1117] rounded-md p-3 mt-2 whitespace-pre-wrap">{preambleText()}</pre>
    </details>
    <div class="grid grid-cols-2 gap-3 text-center">
      <div class="bg-[#0d1117] rounded-md p-2">
        <div class="text-sm font-bold text-[#a371f7]">{preambleLength()}</div>
        <div class="text-[9px] text-[#484f58]">preamble bytes (uploaded, not stored)</div>
      </div>
      <div class="bg-[#0d1117] rounded-md p-2">
        <div class="text-sm font-bold text-[#58a6ff]">8192</div>
        <div class="text-[9px] text-[#484f58]">slot bytes (stored in bundle)</div>
      </div>
    </div>
  </div>
</div>
