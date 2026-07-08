<script lang="ts">
  import { gunzipSync, inflateSync, gzipSync } from 'fflate';

  let ran = $state(false);
  let buggyLen = $state(0);
  let fixedLen = $state(0);
  let fixedText = $state('');

  function runDemo() {
    // Mirror the lib's exact data shape: title\0content\0, gzip level 9, zero mtime,
    // then zero-pad to a fixed length (centurymetadata pads AES to 6487 bytes).
    const raw = new TextEncoder().encode('title\0content\0');
    const gz = gzipSync(raw, { level: 9 });
    gz[4] = 0; gz[5] = 0; gz[6] = 0; gz[7] = 0;
    const padded = new Uint8Array(100);
    padded.set(gz);

    // THE BUG: fflate.gunzipSync on padded gzip data → empty Uint8Array
    let buggy: Uint8Array;
    try { buggy = gunzipSync(padded); } catch { buggy = new Uint8Array(0); }
    buggyLen = buggy.length;

    // THE FIX: parse the gzip (RFC 1952) header manually, feed the raw DEFLATE
    // stream to inflateSync, which stops at end-of-stream and ignores trailing zeros.
    const FLG = padded[3];
    let off = 10;
    if (FLG & 0x04) { const xlen = padded[off] | (padded[off + 1] << 8); off += 2 + xlen; }
    if (FLG & 0x08) { while (off < padded.length && padded[off] !== 0) off++; off++; }
    if (FLG & 0x10) { while (off < padded.length && padded[off] !== 0) off++; off++; }
    if (FLG & 0x02) { off += 2; }
    let fixed: Uint8Array;
    try { fixed = inflateSync(padded.subarray(off)); } catch { fixed = new Uint8Array(0); }
    fixedLen = fixed.length;
    fixedText = new TextDecoder().decode(fixed);
    ran = true;
  }
</script>

<div class="space-y-4">
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">The gunzip-on-padded-data bug (live)</h3>
    <p class="text-[11px] text-[#8b949e] leading-relaxed">
      centurymetadata zero-pads its AES payload to a fixed 6487 bytes. <code class="text-[#d29922]">fflate.gunzipSync</code>
      returns an <strong class="text-[#f85149]">empty</strong> <code class="text-[#d29922]">Uint8Array</code> when fed
      gzip data followed by trailing zero bytes — silently losing the record. The lib works around it by parsing the
      gzip header by hand and feeding the raw DEFLATE stream to <code class="text-[#3fb950]">inflateSync</code>, which
      stops at the end-of-stream marker and ignores the padding.
    </p>
    <button
      onclick={runDemo}
      data-testid="cm-gotcha-run"
      class="px-3 py-1.5 bg-[#1f6feb] hover:bg-[#388bfd] text-white rounded-md text-[11px] font-medium transition-colors"
    >▶ Reproduce the bug</button>
    {#if ran}
      <div class="grid sm:grid-cols-2 gap-3" data-testid="cm-gotcha-result">
        <div class="bg-[#0d1117] border border-[#f85149]/40 rounded-md p-3">
          <div class="text-[10px] text-[#484f58] font-mono mb-1">gunzipSync(padded)</div>
          <div class="text-lg font-bold text-[#f85149]">{buggyLen} bytes</div>
          <div class="text-[10px] text-[#8b949e] mt-1">{buggyLen === 0 ? '✗ record lost (the bug)' : 'unexpected non-empty'}</div>
        </div>
        <div class="bg-[#0d1117] border border-[#3fb950]/40 rounded-md p-3">
          <div class="text-[10px] text-[#484f58] font-mono mb-1">inflateSync(after manual header parse)</div>
          <div class="text-lg font-bold text-[#3fb950]">{fixedLen} bytes</div>
          <div class="text-[10px] text-[#e6edf3] mt-1 break-all">→ "{fixedText}"</div>
        </div>
      </div>
    {/if}
  </div>

  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">Other Node → browser porting gotchas</h3>
    <div class="space-y-2 text-[11px]">
      <div class="bg-[#0d1117] rounded-md p-2.5 border border-[#21262d]">
        <div class="text-[#a371f7] font-mono text-[10px] mb-1">AES-256-CTR</div>
        <div class="text-[#8b949e]"><code class="text-[#f85149]">crypto.createCipheriv('aes-256-ctr', key, iv)</code> (Node) → <code class="text-[#3fb950]">crypto.subtle.encrypt(&#123;name:'AES-CTR',counter,length:128&#125;, ...)</code> (Web Crypto). Same algorithm, different API — and Web Crypto's key must be imported first.</div>
      </div>
      <div class="bg-[#0d1117] rounded-md p-2.5 border border-[#21262d]">
        <div class="text-[#a371f7] font-mono text-[10px] mb-1">secp256k1 ECDH</div>
        <div class="text-[#8b949e]">libsecp's default ECDH hashes the <em>x-coordinate</em> of the shared point with SHA-256. The browser port must do the same manually: <code class="text-[#3fb950]">sha256(point.x)</code>, not the raw point.</div>
      </div>
      <div class="bg-[#0d1117] rounded-md p-2.5 border border-[#21262d]">
        <div class="text-[#a371f7] font-mono text-[10px] mb-1">Buffer → Uint8Array</div>
        <div class="text-[#8b949e]">No <code class="text-[#f85149]">Buffer</code> in the browser — every <code class="text-[#f85149]">Buffer.concat</code>/<code class="text-[#f85149]">Buffer.alloc</code> becomes a manual <code class="text-[#3fb950]">concatBytes(...)</code> / <code class="text-[#3fb950]">new Uint8Array(n)</code>.</div>
      </div>
    </div>
  </div>
</div>
