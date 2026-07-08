<script lang="ts">
  import { encodeRecord, decodeSlot, deriveCmKeys, toHex } from '../lib/centurymetadata';
  import type { CmKeys } from '../lib/centurymetadata';

  let { keys }: { keys: CmKeys } = $props();

  // A deliberately DIFFERENT identity, derived from a different mnemonic, to act
  // as the "wrong reader". (Never used to force-decrypt — see wrong-reader panel.)
  const OTHER_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
  const otherKeys = $derived(deriveCmKeys(OTHER_MNEMONIC));

  // ---- Tamper demo ----
  let tamperSig = $state<string | null>(null);
  let tamperDecrypt = $state<string | null>(null);
  let tampering = $state(false);

  async function runTamper() {
    tampering = true;
    tamperSig = null;
    tamperDecrypt = null;
    try {
      const enc = await encodeRecord(keys, 'untampered', 'original payload', 0n);
      // Flip ONE byte in the SIG region (offset 0..63). Content bytes are untouched,
      // so decodeSlot completes cleanly; the signature no longer verifies.
      const tampered = enc.slot.slice();
      tampered[5] ^= 0x01;
      const decoded = await decodeSlot(keys, tampered);
      tamperSig = decoded.sigValid ? 'valid (unexpected!)' : 'INVALID';
      tamperDecrypt =
        decoded.fields.length > 0
          ? `still decoded — content untouched (${decoded.fields[0][0]}: ${decoded.fields[0][1]})`
          : 'no fields';
    } catch (e) {
      tamperSig = 'error';
      tamperDecrypt = e instanceof Error ? e.message : String(e);
    } finally {
      tampering = false;
    }
  }

  // ---- Wrong-reader demo (NO forced decode — byte comparison only) ----
  let wrongResult = $state<string | null>(null);
  let wrongChecking = $state(false);

  async function runWrongReader() {
    wrongChecking = true;
    wrongResult = null;
    try {
      // Encode a record addressed to YOUR reader_id.
      const enc = await encodeRecord(keys, 'private', 'for your eyes only', 0n);
      const slot = enc.slot;
      // The slot's embedded reader_id lives at bytes 97..129.
      const embeddedReaderId = slot.subarray(97, 129);
      const otherReaderId = otherKeys.readerId;

      let match = true;
      for (let i = 0; i < 32; i++) {
        if (embeddedReaderId[i] !== otherReaderId[i]) {
          match = false;
          break;
        }
      }

      wrongResult = match
        ? 'unexpected match'
        : 'reader_id MISMATCH — this slot is not addressed to otherKeys.\n' +
          `slot reader_id: ${toHex(embeddedReaderId).slice(0, 32)}…\n` +
          `other reader_id: ${toHex(otherReaderId).slice(0, 32)}…\n` +
          'A bundle scan with otherKeys.readerId would never return this slot, and without the matching reader private keys the ECDH and ML-KEM derivations would diverge — forced decryption yields nonsense.';
    } catch (e) {
      wrongResult = 'error — ' + (e instanceof Error ? e.message : String(e));
    } finally {
      wrongChecking = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Tamper -->
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <div class="flex items-center gap-2">
      <span class="text-lg">🔍</span>
      <h3 class="text-sm font-semibold text-[#e6edf3]">Tamper detection (integrity)</h3>
    </div>
    <p class="text-xs text-[#8b949e] leading-relaxed">
      Encode a real record, flip <strong class="text-[#e6edf3]">one bit in the signature</strong>, then decode.
      The BIP-340 signature covers the entire content (writer ∥ reader ∥ gen ∥ ML-KEM_CT ∥ AES), so <strong class="text-[#e6edf3]">any</strong>
      alteration is detected. We tamper the signature specifically so the demo stays readable — tampering the content
      would <em>also</em> invalidate the signature <em>and</em> additionally corrupt the encrypted payload.
    </p>
    <button
      onclick={runTamper}
      disabled={tampering}
      data-testid="cm-tamper-run"
      class="px-3 py-1.5 bg-[#1f6feb] hover:bg-[#388bfd] disabled:bg-[#21262d] disabled:text-[#484f58] text-white rounded-md text-[11px] font-medium transition-colors"
    >
      {tampering ? 'Running…' : '▶ Flip a sig bit & decode'}
    </button>
    {#if tamperSig}
      <div class="space-y-1 text-[11px] font-mono">
        <div data-testid="cm-tamper-sig-status" class="bg-[#0d1117] rounded px-2 py-1 {tamperSig === 'INVALID' ? 'text-[#f85149]' : 'text-[#3fb950]'}">
          signature: {tamperSig}
        </div>
        <div data-testid="cm-tamper-decrypt-status" class="bg-[#0d1117] rounded px-2 py-1 text-[#8b949e] break-all">
          decrypt: {tamperDecrypt}
        </div>
      </div>
    {/if}
  </div>

  <!-- Wrong reader -->
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <div class="flex items-center gap-2">
      <span class="text-lg">🕵️</span>
      <h3 class="text-sm font-semibold text-[#e6edf3]">Wrong reader (confidentiality)</h3>
    </div>
    <p class="text-xs text-[#8b949e] leading-relaxed">
      Encode a record addressed to <strong class="text-[#e6edf3]">your</strong> reader_id, then check it from a
      <strong class="text-[#e6edf3]">different</strong> identity. The slot's embedded reader_id won't match, so the
      bundle scan wouldn't even return it — and without the matching reader private keys, decryption is impossible.
    </p>
    <button
      onclick={runWrongReader}
      disabled={wrongChecking}
      data-testid="cm-wrong-reader-run"
      class="px-3 py-1.5 bg-[#1f6feb] hover:bg-[#388bfd] disabled:bg-[#21262d] disabled:text-[#484f58] text-white rounded-md text-[11px] font-medium transition-colors"
    >
      {wrongChecking ? 'Checking…' : '▶ Encode for you, probe as someone else'}
    </button>
    {#if wrongResult}
      <pre data-testid="cm-wrong-reader-result" class="text-[10px] font-mono whitespace-pre-wrap break-all bg-[#0d1117] border border-[#21262d] rounded-md p-2 {wrongResult.startsWith('reader_id MISMATCH') ? 'text-[#d29922]' : 'text-[#f85149]'}">{wrongResult}</pre>
    {/if}
  </div>

  <div class="bg-[#1c2128] border border-[#30363d] rounded-lg p-3">
    <p class="text-[10px] text-[#8b949e] leading-relaxed">
      <strong class="text-[#e6edf3]">The two pillars:</strong> the signature proves <em>who wrote it and that it's unaltered</em>
      (integrity/authenticity); the reader-key encryption proves <em>only the intended recipient can read it</em>
      (confidentiality). Break either property and centurymetadata stops working.
    </p>
  </div>
</div>
