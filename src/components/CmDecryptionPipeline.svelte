<script lang="ts">
  import { encodeRecord, decodeSlot, toHex } from '../lib/centurymetadata';
  import type { CmKeys, DecodedSlot } from '../lib/centurymetadata';

  let { keys }: { keys: CmKeys } = $props();

  let title = $state('hello');
  let content = $state('decrypt me back');
  let running = $state(false);
  let step = $state(0);
  let result = $state<DecodedSlot | null>(null);
  let showCode = $state<Set<number>>(new Set());

  function toggleCode(n: number) {
    const s = new Set(showCode);
    if (s.has(n)) s.delete(n); else s.add(n);
    showCode = s;
  }

  let readerSecpPubHex = $derived(toHex(keys.readerSecpPubKey));

  async function runDecryption() {
    running = true;
    step = 0;
    result = null;
    try {
      const enc = await encodeRecord(keys, [['text', title, content]], 0n);
      for (let s = 1; s <= 6; s++) {
        await new Promise((r) => setTimeout(r, 280));
        step = s;
        if (s === 5) {
          result = await decodeSlot(keys, enc.slot);
        }
      }
    } finally {
      running = false;
    }
  }

  const stepMeta = [
    { lib: '@noble/curves', func: 'schnorr.verify(sig, hash, pubkey)',
      code: `// src/lib/centurymetadata.ts → decodeSlot()
const sig = slot.subarray(0, 64);
const writerPub = slot.subarray(64, 97);
const contentBytes = slot.subarray(64);
const prehash = taggedHash('centurymetadata v1', contentBytes);
const writerXOnly = writerPub.subarray(1, 33);
const sigValid = schnorr.verify(sig, prehash, writerXOnly);
// Anyone can do this — no private keys needed` },
    { lib: '@noble/curves', func: 'secp256k1 ECDH (reader side)',
      code: `// src/lib/centurymetadata.ts → computeEcdh()
// Reader uses THEIR private key with the WRITER's public key
const sharedPoint = secp256k1.Point
  .fromBytes(slotWriterPub)
  .multiply(bytesToNumberBE(keys.readerSecpPrivKey));
const x = sharedPoint.toBytes(true).subarray(1, 33);
return sha256(x);
// → same secret as encryption step 2 (ECDH is symmetric)` },
    { lib: '@noble/post-quantum', func: 'ml_kem1024.decapsulate(ct, priv)',
      code: `// @noble/post-quantum — FIPS 203 ML-KEM-1024
const slotMlkemCt = slot.subarray(137, 137 + 1568);
const decodeMlkemSecret = ml_kem1024.decapsulate(
  slotMlkemCt, keys.mlkemSecretKey
);
// → same 32-byte secret as encryption step 3
// (decapsulation is deterministic given the private key)` },
    { lib: '@noble/hashes', func: 'sha256(ecdh ∥ mlkem)',
      code: `// Same hybrid derivation as encryption — both secrets required
const decodeAesKey = sha256(
  concatBytes(decodeEcdhSecret, new Uint8Array(decodeMlkemSecret))
);
// → must match the AES key from encryption step 4
// If either secret is wrong, this key is garbage → decryption fails` },
    { lib: 'Web Crypto API', func: 'crypto.subtle.decrypt(AES-CTR)',
      code: `// Browser-native AES-256-CTR decryption via Web Crypto
const cryptoKey = await crypto.subtle.importKey(
  'raw', decodeAesKey, { name: 'AES-CTR' }, false, ['decrypt']
);
const decryptedPadded = await crypto.subtle.decrypt(
  { name: 'AES-CTR', counter: new Uint8Array(16), length: 128 },
  cryptoKey, slotEncrypted
);
// → 6487 bytes of padded gzip data` },
    { lib: 'fflate', func: 'inflateSync + NUL split',
      code: `// Manual gzip header parse + fflate inflate
const FLG = decryptedPadded[3];
let offset = 10;
if (FLG & 0x04) { /* skip extra field */ }
if (FLG & 0x08) { /* skip original filename */ }
if (FLG & 0x10) { /* skip comment */ }
const decompressed = inflateSync(decryptedPadded.subarray(offset));
// Then split by NUL bytes into TYPE/NAME/CONTENTS triples
const text = new TextDecoder().decode(decompressed);
const parts = text.split('\\0');` },
  ];
</script>

<div class="space-y-4">
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">Record to decrypt</h3>
    <div class="grid sm:grid-cols-2 gap-3">
      <input
        bind:value={title}
        data-testid="cm-dec-title"
        placeholder="title"
        class="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
      />
      <input
        bind:value={content}
        data-testid="cm-dec-content"
        placeholder="content"
        class="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
      />
    </div>
    <button
      onclick={runDecryption}
      disabled={running}
      data-testid="cm-dec-run"
      class="px-4 py-2 bg-[#1f6feb] hover:bg-[#388bfd] disabled:bg-[#21262d] disabled:text-[#484f58] text-white rounded-md text-xs font-medium transition-colors"
    >
      {running ? 'Decrypting…' : '▶ Run decryption pipeline'}
    </button>
  </div>

  <div class="space-y-3">
    <!-- Step 1: signature -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 1 ? '' : 'opacity-40'} transition-opacity" data-testid="cm-dec-step-1">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 1 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 1: Verify BIP-340 signature</h4>
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/10 px-1.5 py-0.5 rounded-full">{stepMeta[0].lib}</span>
        <button onclick={() => toggleCode(1)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(1) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] space-y-1 ml-7">
        <p>The slot carries a 64-byte Schnorr signature over the full content. Verify against the writer's x-only pubkey (embedded in the slot).</p>
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">schnorr.verify(sig, taggedHash(TAG, content), writer_xonly)</div>
        {#if result}
          <div class="font-mono {result.sigValid ? 'text-[#3fb950]' : 'text-[#f85149]'} bg-[#0d1117] rounded px-2 py-1">
            sig {result.sigValid ? '✓ VALID — authorship proven' : '✗ INVALID — record tampered'}
          </div>
        {/if}
      </div>
      {#if showCode.has(1)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[0].code}</pre>{/if}
    </div>

    <!-- Step 2: ECDH -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 2 ? '' : 'opacity-40'} transition-opacity" data-testid="cm-dec-step-2">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 2 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 2: ECDH <span class="text-[10px] text-[#3fb950]">(classical)</span></h4>
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/10 px-1.5 py-0.5 rounded-full">{stepMeta[1].lib}</span>
        <button onclick={() => toggleCode(2)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(2) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] space-y-1 ml-7">
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">SHA256(x_coord(reader_secp_priv × writer_pub))</div>
        <div class="font-mono">writer_pub (from slot): <span class="text-[#58a6ff]">…{readerSecpPubHex.slice(-16)}</span></div>
        {#if result}
          <div class="font-mono text-[#d29922] bg-[#0d1117] rounded px-2 py-1 break-all">ecdh_secret[:8] = {result.debug.ecdhPrefix}</div>
        {/if}
      </div>
      {#if showCode.has(2)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[1].code}</pre>{/if}
    </div>

    <!-- Step 3: ML-KEM decapsulate -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 3 ? '' : 'opacity-40'} transition-opacity" data-testid="cm-dec-step-3">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 3 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 3: ML-KEM-1024 decapsulate <span class="text-[10px] text-[#a371f7]">(post-quantum)</span></h4>
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/10 px-1.5 py-0.5 rounded-full">{stepMeta[2].lib}</span>
        <button onclick={() => toggleCode(3)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(3) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] space-y-1 ml-7">
        <p>Decapsulate the 1568-byte ciphertext with the reader's ML-KEM private key → post-quantum shared secret.</p>
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">ML-KEM.decapsulate(MLKEM_CT, reader_mlkem_priv)</div>
        <div class="font-mono text-[#a371f7]">→ 32-byte post-quantum secret (combined into the AES key next)</div>
      </div>
      {#if showCode.has(3)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[2].code}</pre>{/if}
    </div>

    <!-- Step 4: AES key -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 4 ? '' : 'opacity-40'} transition-opacity" data-testid="cm-dec-step-4">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 4 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 4: Derive AES key</h4>
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/10 px-1.5 py-0.5 rounded-full">{stepMeta[3].lib}</span>
        <button onclick={() => toggleCode(4)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(4) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] space-y-1 ml-7">
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">SHA256(ECDH_secret ∥ ML-KEM_secret)</div>
        <p>Same hybrid construction as encryption — both secrets are required.</p>
        {#if result}
          <div class="font-mono text-[#3fb950] bg-[#0d1117] rounded px-2 py-1 break-all">aes_key[:8] = {result.debug.aesKeyPrefix}</div>
        {/if}
      </div>
      {#if showCode.has(4)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[3].code}</pre>{/if}
    </div>

    <!-- Step 5: AES decrypt -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 5 ? '' : 'opacity-40'} transition-opacity" data-testid="cm-dec-step-5">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 5 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 5: AES-256-CTR decrypt</h4>
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/10 px-1.5 py-0.5 rounded-full">{stepMeta[4].lib}</span>
        <button onclick={() => toggleCode(5)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(5) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] space-y-1 ml-7">
        <div class="font-mono bg-[#0d1117] rounded px-2 py-1 text-[#58a6ff]">AES-CTR.decrypt(aes_key, AES_field) → padded gzip stream</div>
        {#if result}
          <div class="font-mono text-[#d29922] bg-[#0d1117] rounded px-2 py-1">gzip magic = {result.debug.decryptedGzipMagic} · {result.debug.decryptedLen} bytes</div>
        {/if}
      </div>
      {#if showCode.has(5)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[4].code}</pre>{/if}
    </div>

    <!-- Step 6: gunzip + parse -->
    <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 {step >= 6 ? '' : 'opacity-40'} transition-opacity" data-testid="cm-dec-step-6">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">{step >= 6 ? '✅' : '⏳'}</span>
        <h4 class="text-sm font-semibold text-[#e6edf3]">Step 6: Gunzip + parse TYPE\0NAME\0CONTENTS\0 triples</h4>
        <span class="text-[9px] text-[#d29922] bg-[#d29922]/10 px-1.5 py-0.5 rounded-full">{stepMeta[5].lib}</span>
        <button onclick={() => toggleCode(6)} class="text-[9px] text-[#8b949e] hover:text-[#58a6ff] ml-auto">{showCode.has(6) ? '✕ code' : '</> code'}</button>
      </div>
      <div class="text-[11px] text-[#8b949e] space-y-1 ml-7">
        <p>Inflate the DEFLATE stream (ignoring zero padding), then split on NUL bytes into TYPE\0NAME\0CONTENTS\0 triples.</p>
        {#if result}
          <div class="font-mono text-[#3fb950] bg-[#0d1117] rounded px-2 py-1">decompressed {result.debug.decompressedLen} bytes</div>
        {/if}
      </div>
      {#if showCode.has(6)}<pre class="text-[9px] font-mono text-[#3fb950] bg-[#0d1117] rounded-md p-2 mt-2 overflow-x-auto whitespace-pre-wrap border border-[#21262d]">{stepMeta[5].code}</pre>{/if}
    </div>
  </div>

  {#if result}
    <div class="bg-[#1c2128] border border-[#30363d] rounded-lg p-4 space-y-2" data-testid="cm-dec-result">
      <p class="text-xs text-[#8b949e] leading-relaxed">
        <strong class="text-[#3fb950]">✅ Record decrypted.</strong> The reader recovered the original plaintext using
        <em>their</em> private keys. Anyone else would get nonsense at step 2/3 (wrong ECDH/ML-KEM secrets).
      </p>
      <div class="bg-[#0d1117] border border-[#21262d] rounded-md p-2 space-y-1" data-testid="cm-dec-fields">
        <div class="text-[10px] text-[#484f58] font-mono mb-1">decoded fields:</div>
        {#each result.triples as [t, n, c] (n)}
          <div class="text-[11px]">
            <span class="text-[#a371f7] font-mono text-[9px] mr-1">{t}</span>
            <span class="text-[#58a6ff] font-mono">{n}:</span>
            <span class="text-[#e6edf3] break-all">{c}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
