<script lang="ts">
  // Static side-by-side: the same ECDH + AES step in the Node reference vs the browser lib.
  const ecdhRows = [
    { label: 'shared point', node: 'secp256k1.Point.fromBytes(pub).multiply(priv)', browser: 'secp256k1.getSharedSecret(priv, pub, true)' },
    { label: 'compressed point', node: 'sharedPoint.toBytes(true)  // 33 bytes, prefix included', browser: '(already 33-byte compressed, prefix included)' },
    { label: 'hash to secret', node: 'crypto.hash_sha256(point)  // libsecp default', browser: 'sha256(point)' },
  ];
  const aesRows = [
    { label: 'create cipher', node: "createCipheriv('aes-256-gcm', key, nonce)", browser: "crypto.subtle.importKey('raw', key, {name:'AES-GCM'}, false, ['encrypt'])" },
    { label: 'encrypt', node: 'cipher.update(data) + cipher.final()', browser: "crypto.subtle.encrypt({name:'AES-GCM', iv:nonce, tagLength:128}, key, data)" },
    { label: 'auth tag', node: 'cipher.getAuthTag()  // 16 bytes, append manually', browser: '(Web Crypto appends the 16-byte tag automatically)' },
    { label: 'output', node: 'Buffer', browser: 'Uint8Array (via new Uint8Array(await …))' },
  ];
  const genRows = [
    { label: 'encode', node: 'genBytes.writeBigUInt64LE(BigInt(gen))', browser: 'int64ToBytesLE(gen)  // manual little-endian byte-fill' },
    { label: 'decode', node: 'genBytes.readBigUInt64LE()', browser: 'bytesLEToInt64(genBytes)' },
  ];
</script>

<div class="space-y-4">
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">Same operation, two runtimes</h3>
    <p class="text-[11px] text-[#8b949e] leading-relaxed">
      <code class="text-[#a371f7]">test/roundtrip.mjs</code> is the Node reference implementation; <code class="text-[#a371f7]">src/lib/cm/</code>
      is the browser port. Both produce byte-identical records — but the APIs diverge sharply. This is why a "just run the
      Node code in the browser" port never works; each primitive needs a manual translation.
    </p>

    <div>
      <div class="text-[10px] text-[#58a6ff] font-mono mb-1">ECDH (writer_priv × reader_secp_pub → shared secret)</div>
      <div class="overflow-x-auto rounded-md border border-[#21262d]">
        <table class="w-full text-[10px] font-mono">
          <thead><tr class="bg-[#0d1117] text-[#484f58]"><th class="text-left p-2">step</th><th class="text-left p-2 text-[#f85149]">Node (test/roundtrip.mjs)</th><th class="text-left p-2 text-[#3fb950]">browser (lib/cm/crypto.ts)</th></tr></thead>
          <tbody>
            {#each ecdhRows as r}
              <tr class="border-t border-[#21262d]"><td class="p-2 text-[#8b949e]">{r.label}</td><td class="p-2 text-[#e6edf3] break-all">{r.node}</td><td class="p-2 text-[#e6edf3] break-all">{r.browser}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="text-[10px] text-[#484f58] mt-1">Both hash the <strong>full 33-byte compressed point</strong> (prefix byte included) — libsecp256k1's default ECDH convention, and now spelled out explicitly in SPECIFICATION.md.</p>
    </div>

    <div>
      <div class="text-[10px] text-[#58a6ff] font-mono mb-1">AES-256-GCM</div>
      <div class="overflow-x-auto rounded-md border border-[#21262d]">
        <table class="w-full text-[10px] font-mono">
          <thead><tr class="bg-[#0d1117] text-[#484f58]"><th class="text-left p-2">step</th><th class="text-left p-2 text-[#f85149]">Node (test/roundtrip.mjs)</th><th class="text-left p-2 text-[#3fb950]">browser (lib/cm/crypto.ts)</th></tr></thead>
          <tbody>
            {#each aesRows as r}
              <tr class="border-t border-[#21262d]"><td class="p-2 text-[#8b949e]">{r.label}</td><td class="p-2 text-[#e6edf3] break-all">{r.node}</td><td class="p-2 text-[#e6edf3] break-all">{r.browser}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <div>
      <div class="text-[10px] text-[#58a6ff] font-mono mb-1">GEN (8-byte little-endian generation counter)</div>
      <div class="overflow-x-auto rounded-md border border-[#21262d]">
        <table class="w-full text-[10px] font-mono">
          <thead><tr class="bg-[#0d1117] text-[#484f58]"><th class="text-left p-2">step</th><th class="text-left p-2 text-[#f85149]">Node (test/roundtrip.mjs)</th><th class="text-left p-2 text-[#3fb950]">browser (lib/cm/utils.ts)</th></tr></thead>
          <tbody>
            {#each genRows as r}
              <tr class="border-t border-[#21262d]"><td class="p-2 text-[#8b949e]">{r.label}</td><td class="p-2 text-[#e6edf3] break-all">{r.node}</td><td class="p-2 text-[#e6edf3] break-all">{r.browser}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <p class="text-[10px] text-[#484f58]">The ML-KEM step is identical in both (@noble/post-quantum works everywhere) — only the classical primitives diverge.</p>
  </div>
</div>
