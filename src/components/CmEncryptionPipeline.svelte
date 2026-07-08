<script lang="ts">
  import { encodeRecord, toHex } from '../lib/centurymetadata';
  import type { CmKeys, EncodeDebug } from '../lib/centurymetadata';

  let { keys }: { keys: CmKeys } = $props();

  let title = $state('hello');
  let content = $state('this is a secret message');
  let debug = $state<EncodeDebug | null>(null);
  let running = $state(false);
  let step = $state(0);

  async function runEncryption() {
    running = true;
    step = 0;
    debug = null;

    await new Promise(r => setTimeout(r, 300));
    step = 1;
    await new Promise(r => setTimeout(r, 300));
    step = 2;
    await new Promise(r => setTimeout(r, 300));
    step = 3;
    await new Promise(r => setTimeout(r, 300));
    step = 4;
    await new Promise(r => setTimeout(r, 300));
    step = 5;
    await new Promise(r => setTimeout(r, 300));

    const result = await encodeRecord(keys, title, content, 0n);
    debug = result.debug;

    step = 6;
    running = false;
  }

  let writerPubHex = $derived(toHex(keys.writerPubKey));
  let readerSecpPubHex = $derived(toHex(keys.readerSecpPubKey));

  const steps = [
    { num: 1, title: 'Prepare Data', icon: '📝' },
    { num: 2, title: 'ECDH Key Exchange', icon: '🤝' },
    { num: 3, title: 'ML-KEM Encapsulation', icon: '🛡️' },
    { num: 4, title: 'Derive AES Key', icon: '🔑' },
    { num: 5, title: 'AES-256-CTR Encrypt', icon: '🔒' },
    { num: 6, title: 'BIP-340 Schnorr Sign', icon: '✍️' },
  ];
</script>

<div class="space-y-4">
  <!-- Input -->
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">Your Record</h3>
    <div class="grid sm:grid-cols-2 gap-3">
      <input
        bind:value={title}
        data-testid="cm-enc-title"
        placeholder="title"
        class="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
      />
      <input
        bind:value={content}
        data-testid="cm-enc-content"
        placeholder="content"
        class="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
      />
    </div>
    <button
      onclick={runEncryption}
      disabled={running}
      data-testid="cm-enc-run"
      class="px-4 py-2 bg-[#1f6feb] hover:bg-[#388bfd] disabled:bg-[#21262d] disabled:text-[#484f58] text-white rounded-md text-xs font-medium transition-colors"
    >
      {running ? 'Encrypting...' : '▶ Run Encryption Pipeline'}
    </button>
  </div>

  <!-- Steps -->
  <div class="space-y-3">
    <!-- Step 1: Data Preparation -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 1 ? '' : 'opacity-40'} transition-opacity">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 1 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 1: Prepare Data</h4>
      </div>
      <div class="text-[10px] text-[#8b949e] font-mono space-y-1 ml-7">
        <div>title = "{title}"</div>
        <div>content = "{content}"</div>
        <div class="text-[#a371f7]">data = title\0content\0 → {title.length + content.length + 2} bytes</div>
        <div class="text-[#3fb950]">gzip(data) → {debug ? `${debug.compressedLen} bytes` : '...'}</div>
        <div class="text-[#58a6ff]">pad to 6487 bytes (zero-fill)</div>
      </div>
    </div>

    <!-- Step 2: ECDH -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 2 ? '' : 'opacity-40'} transition-opacity">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 2 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 2: ECDH Key Exchange <span class="text-[10px] text-[#3fb950]">(classical)</span></h4>
      </div>
      <div class="text-[10px] text-[#8b949e] space-y-1 ml-7">
        <p>secp256k1 Diffie-Hellman between writer and reader:</p>
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">writer_priv × reader_secp_pub → shared_point</div>
        <div class="font-mono">writer_pubkey: <span class="text-[#58a6ff]">{writerPubHex.slice(0, 16)}...</span></div>
        <div class="font-mono">reader_secp_pub: <span class="text-[#58a6ff]">{readerSecpPubHex.slice(0, 16)}...</span></div>
        <div class="font-mono text-[#d29922]">SHA256(x_coordinate(shared_point)) =</div>
        {#if debug}
          <div class="font-mono text-[#d29922] bg-[#0d1117] rounded px-2 py-1 break-all">{debug.ecdhSecret}</div>
        {:else}
          <div class="font-mono text-[#484f58]">→ 32 bytes (run to see)</div>
        {/if}
        <p class="text-[#f85149] text-[9px] mt-1">⚠ Vulnerable to quantum computers (Shor's algorithm)</p>
      </div>
    </div>

    <!-- Step 3: ML-KEM -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 3 ? '' : 'opacity-40'} transition-opacity">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 3 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 3: ML-KEM-1024 Encapsulation <span class="text-[10px] text-[#a371f7]">(post-quantum)</span></h4>
      </div>
      <div class="text-[10px] text-[#8b949e] space-y-1 ml-7">
        <p>FIPS 203 key encapsulation to reader's ML-KEM public key:</p>
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">ML-KEM.encapsulate(reader_mlkem_pubkey)</div>
        <div class="font-mono text-[#d29922]">→ ciphertext: {debug ? `${debug.mlkemCtLen} bytes` : '...'} (goes in the slot)</div>
        <div class="font-mono text-[#a371f7]">→ shared secret: 32 bytes (used to derive AES key)</div>
        {#if debug}
          <div class="font-mono text-[#a371f7] bg-[#0d1117] rounded px-2 py-1 break-all">{debug.mlkemSecret}</div>
        {/if}
        <p class="text-[#3fb950] text-[9px] mt-1">✓ Resistant to quantum computers (lattice-based)</p>
      </div>
    </div>

    <!-- Step 4: AES Key -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 4 ? '' : 'opacity-40'} transition-opacity">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 4 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 4: Derive AES Key</h4>
      </div>
      <div class="text-[10px] text-[#8b949e] space-y-1 ml-7">
        <p>Combine both secrets into one AES key:</p>
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">SHA256(ECDH_secret ∥ ML-KEM_secret)</div>
        <p class="text-[#e6edf3] mt-1">This is the <strong>hybrid</strong> part — breaking either ECDH or ML-KEM alone is NOT enough. The attacker needs both.</p>
        {#if debug}
          <div class="font-mono text-[#3fb950] bg-[#0d1117] rounded px-2 py-1 break-all">AES key = {debug.aesKey}</div>
        {:else}
          <div class="font-mono text-[#484f58]">→ 32 bytes (run to see)</div>
        {/if}
      </div>
    </div>

    <!-- Step 5: AES Encrypt -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 5 ? '' : 'opacity-40'} transition-opacity">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 5 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 5: AES-256-CTR Encrypt</h4>
      </div>
      <div class="text-[10px] text-[#8b949e] space-y-1 ml-7">
        <p>Encrypt the gzip'd, padded data:</p>
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">AES-256-CTR(key, padded_data) → ciphertext</div>
        <div class="font-mono text-[#d29922]">→ {debug ? `${debug.encryptedLen} bytes` : '6487 bytes'} (goes in the AES field of the slot)</div>
      </div>
    </div>

    <!-- Step 6: Sign -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 6 ? '' : 'opacity-40'} transition-opacity">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 6 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 6: BIP-340 Schnorr Signature</h4>
      </div>
      <div class="text-[10px] text-[#8b949e] space-y-1 ml-7">
        <p>Sign the record so readers can verify authorship:</p>
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">Schnorr.sign(taggedHash(TAG, body), writer_priv)</div>
        {#if debug}
          <div class="font-mono text-[#f85149] bg-[#0d1117] rounded px-2 py-1 break-all">{debug.sigHex}</div>
        {:else}
          <div class="font-mono text-[#484f58]">→ 64-byte signature</div>
        {/if}
      </div>
    </div>
  </div>

  {#if debug}
    <div class="bg-[#1c2128] border border-[#30363d] rounded-lg p-4" data-testid="cm-enc-done">
      <p class="text-xs text-[#8b949e] leading-relaxed">
        <strong class="text-[#3fb950]">✅ Record encrypted!</strong>
        The 8192-byte slot is ready. SIG + WRITER + READER + GEN are cleartext (137 bytes).
        MLKEM_CT + AES are encrypted (8055 bytes). An attacker needs to break <strong class="text-[#e6edf3]">both</strong>
        ECDH and ML-KEM-1024 to recover the AES key and decrypt your data.
      </p>
    </div>
  {/if}
</div>
