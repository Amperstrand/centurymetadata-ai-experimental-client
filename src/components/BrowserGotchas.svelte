<script lang="ts">
  let ran = $state(false);
  let goodLen = $state(0);
  let badLen = $state(0);
  let goodText = $state('');
  let badError = $state('');

  // Upstream master 547b543 switched the AES field from AES-256-CTR to
  // AES-256-GCM with a 16-byte authentication tag appended. This demo shows
  // what that buys: flipping ONE ciphertext bit makes decrypt() throw.
  async function runDemo() {
    const raw = new TextEncoder().encode('bitcoin wallet labels\0test\0{"type":"tx","ref":"f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16","label":"demo"}\0');
    const key = crypto.getRandomValues(new Uint8Array(32));
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128 }, cryptoKey, raw,
    ));

    const good = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128 }, cryptoKey, encrypted,
    ));
    goodLen = good.length;
    goodText = new TextDecoder().decode(good);

    const tampered = encrypted.slice();
    tampered[0] ^= 0x01;
    try {
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128 }, cryptoKey, tampered,
      );
      badLen = 0;
      badError = 'unexpected success';
    } catch {
      badLen = 0;
      badError = 'GCM authentication failed (tag mismatch)';
    }
    ran = true;
  }
</script>

<div class="space-y-4">
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">The AES-256-GCM tamper-detection demo (live)</h3>
    <p class="text-[11px] text-[#8b949e] leading-relaxed">
      centurymetadata encrypts its payload with <strong class="text-[#3fb950]">AES-256-GCM</strong> (12-byte all-zero nonce,
      16-byte authentication tag appended — upstream master <code class="text-[#d29922]">547b543</code>).
      Flip <strong class="text-[#f85149]">one bit</strong> of the ciphertext and <code class="text-[#d29922]">crypto.subtle.decrypt</code>
      throws instead of returning corrupted plaintext — tampering is detected, not silently decrypted.
      (The old AES-CTR format decrypted garbage without complaint.)
    </p>
    <button
      onclick={runDemo}
      data-testid="cm-gotcha-run"
      class="px-3 py-1.5 bg-[#1f6feb] hover:bg-[#388bfd] text-white rounded-md text-[11px] font-medium transition-colors"
    >▶ Run the demo</button>
    {#if ran}
      <div class="grid sm:grid-cols-2 gap-3" data-testid="cm-gotcha-result">
        <div class="bg-[#0d1117] border border-[#3fb950]/40 rounded-md p-3">
          <div class="text-[10px] text-[#484f58] font-mono mb-1">decrypt(intact ciphertext)</div>
          <div class="text-lg font-bold text-[#3fb950]">{goodLen} bytes</div>
          <div class="text-[10px] text-[#e6edf3] mt-1 break-all">→ "{goodText}"</div>
        </div>
        <div class="bg-[#0d1117] border border-[#f85149]/40 rounded-md p-3">
          <div class="text-[10px] text-[#484f58] font-mono mb-1">decrypt(one flipped bit)</div>
          <div class="text-lg font-bold text-[#f85149]">{badLen} bytes</div>
          <div class="text-[10px] text-[#8b949e] mt-1">✗ {badError}</div>
        </div>
      </div>
    {/if}
  </div>

  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">Other Node → browser porting gotchas</h3>
    <div class="space-y-2 text-[11px]">
      <div class="bg-[#0d1117] rounded-md p-2.5 border border-[#21262d]">
        <div class="text-[#a371f7] font-mono text-[10px] mb-1">AES-256-GCM</div>
        <div class="text-[#8b949e]"><code class="text-[#f85149]">crypto.createCipheriv('aes-256-gcm', key, iv)</code> (Node) → <code class="text-[#3fb950]">crypto.subtle.encrypt(&#123;name:'AES-GCM',iv,length:128&#125;, ...)</code> (Web Crypto). Web Crypto's encrypt() returns ciphertext with the tag already appended — exactly the upstream wire order. The key must be imported first.</div>
      </div>
      <div class="bg-[#0d1117] rounded-md p-2.5 border border-[#21262d]">
        <div class="text-[#a371f7] font-mono text-[10px] mb-1">secp256k1 ECDH</div>
        <div class="text-[#8b949e]">libsecp's default ECDH hashes the <em>full 33-byte compressed</em> shared point with SHA-256, not just the x-coordinate. The browser port does <code class="text-[#3fb950]">sha256(getSharedSecret(priv, pub))</code> — hashing only <code class="text-[#f85149]">point.x</code> was a real interop bug caught by the wire-format audit (see <code class="text-[#d29922]">docs/audits/</code>).</div>
      </div>
      <div class="bg-[#0d1117] rounded-md p-2.5 border border-[#21262d]">
        <div class="text-[#a371f7] font-mono text-[10px] mb-1">Buffer → Uint8Array</div>
        <div class="text-[#8b949e]">No <code class="text-[#f85149]">Buffer</code> in the browser — every <code class="text-[#f85149]">Buffer.concat</code>/<code class="text-[#f85149]">Buffer.alloc</code> becomes a manual <code class="text-[#3fb950]">concatBytes(...)</code> / <code class="text-[#3fb950]">new Uint8Array(n)</code>.</div>
      </div>
      <div class="bg-[#0d1117] rounded-md p-2.5 border border-[#21262d]">
        <div class="text-[#a371f7] font-mono text-[10px] mb-1">zlib, not gzip</div>
        <div class="text-[#8b949e]">Upstream switched DATA compression from gzip to <strong>zlib</strong> (RFC 1950) at master 547b543, so the old gzip OS-byte patch (byte 9 → 0xff) is gone — zlib headers carry no platform-dependent bytes. fflate's <code class="text-[#3fb950]">zlibSync</code>/<code class="text-[#3fb950]">unzlibSync</code> produce/consume these; unzlibSync stops at the end-of-stream marker and ignores the zero padding after it.</div>
      </div>
    </div>
  </div>
</div>
