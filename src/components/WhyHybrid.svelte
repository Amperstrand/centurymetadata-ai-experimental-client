<script lang="ts">
  // "Why hybrid" — concrete what-if scenarios. No interaction needed; pure pedagogy.
</script>

<div class="space-y-4">
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">Why two layers, not one?</h3>
    <p class="text-[11px] text-[#8b949e] leading-relaxed">
      The AES key is <code class="text-[#a371f7]">SHA256(ECDH_secret ∥ ML-KEM_secret)</code>. Each secret is a
      <em>different</em> mathematical hardness assumption. Breaking the record means breaking <strong class="text-[#e6edf3]">both</strong>
      — and they fail in different futures.
    </p>

    <div class="grid sm:grid-cols-2 gap-3">
      <div class="bg-[#0d1117] border border-[#f85149]/40 rounded-md p-3 space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-xl">⚛️</span>
          <span class="text-[#f85149] text-xs font-semibold">If a quantum computer breaks ECDH</span>
        </div>
        <p class="text-[10px] text-[#8b949e] leading-relaxed">
          Shor's algorithm factors the elliptic-curve discrete log → the classical ECDH secret leaks. <strong class="text-[#3fb950]">But
          ML-KEM-1024 (lattice-based) still holds</strong> — there's no known quantum algorithm that breaks it efficiently.
          The AES key stays safe because half of it (the ML-KEM secret) is unbroken. The record survives.
        </p>
      </div>

      <div class="bg-[#0d1117] border border-[#3fb950]/40 rounded-md p-3 space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-xl">🔬</span>
          <span class="text-[#3fb950] text-xs font-semibold">If ML-KEM turns out flawed</span>
        </div>
        <p class="text-[10px] text-[#8b949e] leading-relaxed">
          Maybe a future cryptanalysis breakthrough breaks ML-KEM-1024's specific parameter set. <strong class="text-[#3fb950]">But
          ECDH (secp256k1, battle-tested in Bitcoin) still holds</strong> today. The AES key stays safe because half of it
          (the ECDH secret) is unbroken. The record survives.
        </p>
      </div>
    </div>

    <div class="bg-[#1c2128] border border-[#30363d] rounded-md p-3">
      <p class="text-[11px] text-[#e6edf3] leading-relaxed">
        <strong>Why records target a 100-year horizon:</strong> a record written today must stay confidential through
        <em>both</em> the era when only classical crypto is attacked (quantum matures) <em>and</em> any future era where a
        given post-quantum scheme gets broken. Hybrid encryption is hedging across unknown timelines.
      </p>
    </div>
  </div>
</div>
