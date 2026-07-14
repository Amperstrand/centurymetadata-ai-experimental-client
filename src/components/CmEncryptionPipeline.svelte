<script lang="ts">
  import { encodeRecord, toHex } from '../lib/centurymetadata';
  import type { CmKeys, EncodeDebug } from '../lib/centurymetadata';

  let { keys }: { keys: CmKeys } = $props();

  let title = $state('hello');
  let content = $state('this is a secret message');
  let debug = $state<EncodeDebug | null>(null);
  let running = $state(false);
  let step = $state(0);
  let showCode = $state<Set<number>>(new Set());

  function toggleCode(n: number) {
    const s = new Set(showCode);
    if (s.has(n)) s.delete(n); else s.add(n);
    showCode = s;
  }

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

    const result = await encodeRecord(keys, [['text', title, content]], 0n);
    debug = result.debug;

    step = 6;
    running = false;
  }

  let writerPubHex = $derived(toHex(keys.writerPubKey));
  let readerSecpPubHex = $derived(toHex(keys.readerSecpPubKey));

  const stepMeta = [
    { lib: 'fflate + TextEncoder', func: 'gzipSync(data, {level:9}) + pad to 6487',
      code: `// src/lib/centurymetadata.ts → encodeRecord()
const encoder = new TextEncoder();
const parts = [];
for (const [type, name, contents] of triples) {
  parts.push(encoder.encode(type), [0], encoder.encode(name), [0], encoder.encode(contents), [0]);
}
const rawData = concatBytes(...parts);
const compressed = gzipSync(rawData, { level: 9 });
compressed[4]=0; compressed[5]=0; compressed[6]=0; compressed[7]=0;
if (compressed.length > 9) compressed[9] = 0xff;
const padded = new Uint8Array(6487);
padded.set(compressed);` },
    { lib: '@noble/curves', func: 'secp256k1 ECDH → sha256(x)',
      code: `// src/lib/centurymetadata.ts → computeEcdh()
const sharedPoint = secp256k1.Point
  .fromBytes(readerSecpPubKey)
  .multiply(bytesToNumberBE(writerPrivKey));
const x = sharedPoint.toBytes(true).subarray(1, 33);
return sha256(x);
// → 32-byte classical shared secret` },
    { lib: '@noble/post-quantum', func: 'ml_kem1024.encapsulate(pubkey)',
      code: `// @noble/post-quantum — FIPS 203 ML-KEM-1024
const encap = ml_kem1024.encapsulate(keys.mlkemPublicKey);
const mlkemCt = new Uint8Array(encap.cipherText);    // 1568 bytes → goes in slot
const mlkemSecret = new Uint8Array(encap.sharedSecret); // 32 bytes → AES key input` },
    { lib: '@noble/hashes', func: 'sha256(ecdh ∥ mlkem)',
      code: `// Hybrid key derivation — both secrets required
const aesKey = sha256(concatBytes(ecdhSecret, mlkemSecret));
// → 32-byte AES-256 key
// Breaking ECDH alone is useless. Breaking ML-KEM alone is useless.
// Attacker must break BOTH to recover this key.` },
    { lib: 'Web Crypto API', func: 'crypto.subtle.encrypt(AES-CTR)',
      code: `// Browser-native AES-256-CTR via Web Crypto
const cryptoKey = await crypto.subtle.importKey(
  'raw', aesKey, { name: 'AES-CTR' }, false, ['encrypt']
);
const encrypted = await crypto.subtle.encrypt(
  { name: 'AES-CTR', counter: new Uint8Array(16), length: 128 },
  cryptoKey, padded
);
// counter starts at 0, nonce is all-zeros
// → 6487 bytes of AES ciphertext → goes in slot` },
    { lib: '@noble/curves', func: 'schnorr.sign(taggedHash, priv)',
      code: `// BIP-340 Schnorr signature over the record content
const contentBytes = concatBytes(
  writerPubKey, readerId, genBytes, mlkemCt, encrypted
);
const prehash = taggedHash('centurymetadata v1', contentBytes);
const sig = schnorr.sign(prehash, writerPrivKey);
// → 64-byte signature → goes in slot
// Anyone can verify this WITHOUT private keys:
//   schnorr.verify(sig, prehash, writerXOnly)` },
  ];
</script>

<div class="space-y-4">
  <!-- Input -->
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">Your Record</h3>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="block">
        <span class="text-[10px] text-[#8b949e] font-medium block mb-1">title</span>
        <input
          bind:value={title}
          data-testid="cm-enc-title"
          class="w-full bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
        />
      </label>
      <label class="block">
        <span class="text-[10px] text-[#8b949e] font-medium block mb-1">content</span>
        <input
          bind:value={content}
          data-testid="cm-enc-content"
          class="w-full bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
        />
      </label>
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
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/20 px-1.5 py-0.5 rounded-full">{stepMeta[0].lib}</span>
        <button onclick={() => toggleCode(1)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(1) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] font-mono space-y-1 ml-7">
        <div>title = "{title}"</div>
        <div>content = "{content}"</div>
        <div class="text-[#a371f7]">data = TYPE\0NAME\0CONTENTS\0 → {title.length + content.length + 8} bytes</div>
        <div class="text-[#3fb950]">gzip(data) → {debug ? `${debug.compressedLen} bytes` : '...'}</div>
        <div class="text-[#58a6ff]">pad to 6487 bytes (zero-fill)</div>
      </div>
      {#if showCode.has(1)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[0].code}</pre>{/if}
    </div>

    <!-- Step 2: ECDH -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 2 ? '' : 'opacity-40'} transition-opacity">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 2 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 2: ECDH Key Exchange <span class="text-[10px] text-[#3fb950]">(classical)</span></h4>
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/20 px-1.5 py-0.5 rounded-full">{stepMeta[1].lib}</span>
        <button onclick={() => toggleCode(2)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(2) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] space-y-1 ml-7">
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
      {#if showCode.has(2)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[1].code}</pre>{/if}
    </div>

    <!-- Step 3: ML-KEM -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 3 ? '' : 'opacity-40'} transition-opacity">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 3 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 3: ML-KEM-1024 Encapsulation <span class="text-[10px] text-[#a371f7]">(post-quantum)</span></h4>
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/20 px-1.5 py-0.5 rounded-full">{stepMeta[2].lib}</span>
        <button onclick={() => toggleCode(3)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(3) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] space-y-1 ml-7">
        <p>FIPS 203 key encapsulation to reader's ML-KEM public key:</p>
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">ML-KEM.encapsulate(reader_mlkem_pubkey)</div>
        <div class="font-mono text-[#d29922]">→ ciphertext: {debug ? `${debug.mlkemCtLen} bytes` : '...'} (goes in the slot)</div>
        <div class="font-mono text-[#a371f7]">→ shared secret: 32 bytes (used to derive AES key)</div>
        {#if debug}
          <div class="font-mono text-[#a371f7] bg-[#0d1117] rounded px-2 py-1 break-all">{debug.mlkemSecret}</div>
        {/if}
        <p class="text-[#3fb950] text-[9px] mt-1">✓ Resistant to quantum computers (lattice-based)</p>
      </div>
      {#if showCode.has(3)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[2].code}</pre>{/if}
    </div>

    <!-- Step 4: AES Key -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 4 ? '' : 'opacity-40'} transition-opacity">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 4 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 4: Derive AES Key</h4>
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/20 px-1.5 py-0.5 rounded-full">{stepMeta[3].lib}</span>
        <button onclick={() => toggleCode(4)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(4) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] space-y-1 ml-7">
        <p>Combine both secrets into one AES key:</p>
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">SHA256(ECDH_secret ∥ ML-KEM_secret)</div>
        <p class="text-[#e6edf3] mt-1">This is the <strong>hybrid</strong> part — breaking either ECDH or ML-KEM alone is NOT enough. The attacker needs both.</p>
        {#if debug}
          <div class="font-mono text-[#3fb950] bg-[#0d1117] rounded px-2 py-1 break-all">AES key = {debug.aesKey}</div>
        {:else}
          <div class="font-mono text-[#484f58]">→ 32 bytes (run to see)</div>
        {/if}
      </div>
      {#if showCode.has(4)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[3].code}</pre>{/if}
    </div>

    <!-- Step 5: AES Encrypt -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 5 ? '' : 'opacity-40'} transition-opacity">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 5 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 5: AES-256-CTR Encrypt</h4>
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/20 px-1.5 py-0.5 rounded-full">{stepMeta[4].lib}</span>
        <button onclick={() => toggleCode(5)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(5) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] space-y-1 ml-7">
        <p>Encrypt the gzip'd, padded data:</p>
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">AES-256-CTR(key, padded_data) → ciphertext</div>
        <div class="font-mono text-[#d29922]">→ {debug ? `${debug.encryptedLen} bytes` : '6487 bytes'} (goes in the AES field of the slot)</div>
      </div>
      {#if showCode.has(5)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[4].code}</pre>{/if}
    </div>

    <!-- Step 6: Sign -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 6 ? '' : 'opacity-40'} transition-opacity">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 6 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 6: BIP-340 Schnorr Signature</h4>
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/20 px-1.5 py-0.5 rounded-full">{stepMeta[5].lib}</span>
        <button onclick={() => toggleCode(6)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(6) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] space-y-1 ml-7">
        <p>Sign the record so readers can verify authorship:</p>
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">Schnorr.sign(taggedHash(TAG, body), writer_priv)</div>
        {#if debug}
          <div class="font-mono text-[#f85149] bg-[#0d1117] rounded px-2 py-1 break-all">{debug.sigHex}</div>
        {:else}
          <div class="font-mono text-[#484f58]">→ 64-byte signature</div>
        {/if}
      </div>
      {#if showCode.has(6)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[5].code}</pre>{/if}
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
