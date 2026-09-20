<script lang="ts">
  import { inflateSync, zlibSync } from 'fflate';

  let ran = $state(false);
  let fixedLen = $state(0);
  let fixedText = $state('');
  let truncatedThrows = $state('');

  function runDemo() {
    // zero-pad to a fixed length (centurymetadata pads its zlib payload to 14663 bytes).
    const raw = new TextEncoder().encode('bitcoin wallet labels\0test\0{"type":"tx","ref":"f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16","label":"demo"}\0');
    const z = zlibSync(raw, { level: 9 });
    const padded = new Uint8Array(300);
    padded.set(z);

    // src/lib/cm/crypto.ts → zlibDecompress(): validate the 2-byte zlib header ourselves
    // (CMF/FLG checksum, no FDICT), then feed the raw DEFLATE body to inflateSync, which
    // stops at its own end-of-stream marker and ignores whatever padding follows it.
    let fixed: Uint8Array;
    try { fixed = inflateSync(padded.subarray(2)); } catch { fixed = new Uint8Array(0); }
    fixedLen = fixed.length;
    fixedText = new TextDecoder().decode(fixed);

    // A genuinely truncated stream (cut mid-DEFLATE-block, not just padding) throws with
    // .code === 0 ("unexpected EOF") -- that's how BAD_ZLIB and TRUNCATED_ZLIB are told apart.
    try {
      inflateSync(z.subarray(2, z.length - 6));
      truncatedThrows = '(did not throw — unexpected)';
    } catch (e) {
      truncatedThrows = e instanceof Error ? `${e.message} (code=${(e as { code?: number }).code})` : String(e);
    }
    ran = true;
  }
</script>

<div class="space-y-4">
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">zlib + zero padding (live)</h3>
    <p class="text-[11px] text-[#8b949e] leading-relaxed">
      centurymetadata zero-pads its zlib payload to a fixed 14663 bytes. Handing the whole padded buffer to
      <code class="text-[#f85149]">fflate.unzlibSync</code> would actually work fine here (it correctly stops at the
      DEFLATE end marker and ignores the padding) — but it gives no clean way to tell "not zlib at all" apart from
      "valid so far, cut short", which the spec requires (<code class="text-[#a371f7]">BAD_ZLIB</code> vs
      <code class="text-[#a371f7]">TRUNCATED_ZLIB</code> are different, distinguishable reader errors). So the lib
      validates the 2-byte zlib header itself, then hands the raw DEFLATE body to
      <code class="text-[#3fb950]">inflateSync</code>, whose thrown error carries a <code class="text-[#3fb950]">.code</code>
      that's <code class="text-[#3fb950]">0</code> ("unexpected EOF") specifically for a truncated stream.
    </p>
    <button
      onclick={runDemo}
      data-testid="cm-gotcha-run"
      class="px-3 py-1.5 bg-[#1f6feb] hover:bg-[#388bfd] text-white rounded-md text-[11px] font-medium transition-colors"
    >▶ Run it</button>
    {#if ran}
      <div class="grid sm:grid-cols-2 gap-3" data-testid="cm-gotcha-result">
        <div class="bg-[#0d1117] border border-[#3fb950]/40 rounded-md p-3">
          <div class="text-[10px] text-[#484f58] font-mono mb-1">inflateSync(padded.subarray(2))</div>
          <div class="text-lg font-bold text-[#3fb950]">{fixedLen} bytes</div>
          <div class="text-[10px] text-[#e6edf3] mt-1 break-all">→ "{fixedText}"</div>
        </div>
        <div class="bg-[#0d1117] border border-[#d29922]/40 rounded-md p-3">
          <div class="text-[10px] text-[#484f58] font-mono mb-1">inflateSync(genuinely truncated)</div>
          <div class="text-sm font-bold text-[#d29922] break-all">{truncatedThrows}</div>
          <div class="text-[10px] text-[#8b949e] mt-1">→ maps to TRUNCATED_ZLIB, not BAD_ZLIB</div>
        </div>
      </div>
    {/if}
  </div>

  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">History: the old gzip-era gunzipSync bug</h3>
    <p class="text-[11px] text-[#8b949e] leading-relaxed">
      Before upstream's 2026-07 SPECIFICATION.md rewrite switched the wire format from gzip to zlib, this client hit a
      real bug from the same root cause (fixed-length zero padding after a compressed stream):
      <code class="text-[#d29922]">fflate.gunzipSync</code> returned an <strong class="text-[#f85149]">empty</strong>
      <code class="text-[#d29922]">Uint8Array</code> — not an error, not garbage, nothing — when fed gzip data followed
      by trailing zero bytes, silently losing the whole record. gzip's header also carries an OS byte and mtime field
      that had to be forced to fixed values for cross-platform reproducibility. zlib's 2-byte header has neither
      problem. None of this applies to the current implementation; it's kept here as porting history.
    </p>
  </div>

  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">Other Node → browser porting gotchas</h3>
    <div class="space-y-2 text-[11px]">
      <div class="bg-[#0d1117] rounded-md p-2.5 border border-[#21262d]">
        <div class="text-[#a371f7] font-mono text-[10px] mb-1">AES-256-GCM</div>
        <div class="text-[#8b949e]"><code class="text-[#f85149]">crypto.createCipheriv('aes-256-gcm', key, nonce)</code> + <code class="text-[#f85149]">cipher.getAuthTag()</code> (Node) → <code class="text-[#3fb950]">crypto.subtle.encrypt(&#123;name:'AES-GCM',iv,tagLength:128&#125;, ...)</code> (Web Crypto). Web Crypto appends/expects the 16-byte tag concatenated onto the ciphertext automatically — no separate tag handling needed, but the key must still be imported first.</div>
      </div>
      <div class="bg-[#0d1117] rounded-md p-2.5 border border-[#21262d]">
        <div class="text-[#a371f7] font-mono text-[10px] mb-1">secp256k1 ECDH</div>
        <div class="text-[#8b949e]">libsecp's default ECDH hashes the <em>full 33-byte compressed point</em> (prefix byte included) with SHA-256 — not just the x-coordinate. An earlier version of this port got this wrong (<code class="text-[#f85149]">sha256(point.x)</code>, 32 bytes), which happened to still work for encrypt→decrypt round-trips against itself but would silently disagree with any spec-compliant implementation. Correct: <code class="text-[#3fb950]">sha256(point.toBytes(true))</code>, the full 33 bytes.</div>
      </div>
      <div class="bg-[#0d1117] rounded-md p-2.5 border border-[#21262d]">
        <div class="text-[#a371f7] font-mono text-[10px] mb-1">Buffer → Uint8Array</div>
        <div class="text-[#8b949e]">No <code class="text-[#f85149]">Buffer</code> in the browser — every <code class="text-[#f85149]">Buffer.concat</code>/<code class="text-[#f85149]">Buffer.alloc</code> becomes a manual <code class="text-[#3fb950]">concatBytes(...)</code> / <code class="text-[#3fb950]">new Uint8Array(n)</code>.</div>
      </div>
      <div class="bg-[#0d1117] rounded-md p-2.5 border border-[#21262d]">
        <div class="text-[#a371f7] font-mono text-[10px] mb-1">GEN endianness</div>
        <div class="text-[#8b949e]">The 8-byte generation counter is <strong class="text-[#e6edf3]">little-endian</strong>. Node's <code class="text-[#3fb950]">genBytes.writeBigUInt64LE(...)</code> / browser's manual little-endian byte-fill both need to agree with the server — an easy off-by-endianness bug since it doesn't show up until GEN exceeds 255.</div>
      </div>
    </div>
  </div>
</div>
