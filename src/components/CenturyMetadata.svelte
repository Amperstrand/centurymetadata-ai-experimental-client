<script lang="ts">
  import { onMount } from 'svelte';
  import { deriveCmKeys, toHex, scanNetwork } from '../lib/centurymetadata';
  import type { CmKeys, SlotPublic, NetworkStats } from '../lib/centurymetadata';
  import NostrIdentity from './NostrIdentity.svelte';
  import TourMode from './TourMode.svelte';

  const ABANDON_12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  let mnemonic = $state(ABANDON_12);
  let keys = $state<CmKeys | null>(null);
  let deriveError = $state('');
  let activeSection = $state('overview');
  let networkSlots = $state<SlotPublic[]>([]);
  let networkStats = $state<NetworkStats | null>(null);
  let scanning = $state(false);

  const sections = [
    { id: 'overview', num: 1, label: 'The Big Picture', icon: '🌍' },
    { id: 'keys', num: 2, label: 'Keys & Identity', icon: '🔑' },
    { id: 'record', num: 3, label: 'Record Anatomy', icon: '📦' },
    { id: 'encryption', num: 4, label: 'Encryption', icon: '🔐' },
    { id: 'decryption', num: 5, label: 'Decryption', icon: '🔓' },
    { id: 'security', num: 6, label: 'Security Demos', icon: '🛡️' },
    { id: 'whyhybrid', num: 7, label: 'Why Hybrid', icon: '🧬' },
    { id: 'gotchas', num: 8, label: 'Browser Crypto', icon: '🐞' },
    { id: 'nodevsbrowser', num: 9, label: 'Node vs Browser', icon: '🔄' },
    { id: 'bundle', num: 10, label: 'The Bundle', icon: '🌐' },
    { id: 'playground', num: 11, label: 'Try It Yourself', icon: '🎮' },
  ];

  function handleDerive() {
    deriveError = '';
    try {
      keys = deriveCmKeys(mnemonic.trim());
    } catch (e) {
      keys = null;
      deriveError = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleScan() {
    scanning = true;
    try {
      const { slots, stats } = await scanNetwork();
      networkSlots = slots;
      networkStats = stats;
    } catch {
      // silent — grid section shows its own retry
    }
    scanning = false;
  }

  function scrollToSection(id: string) {
    const el = document.getElementById(`cm-section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleScroll() {
    for (const s of sections) {
      const el = document.getElementById(`cm-section-${s.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 120 && rect.bottom >= 120) {
          activeSection = s.id;
          break;
        }
      }
    }
  }

  onMount(() => {
    handleDerive();
    handleScan();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  });

  let readerIdHex = $derived(keys ? toHex(keys.readerId) : '');
  let writerPubHex = $derived(keys ? toHex(keys.writerPubKey) : '');
</script>

<div class="cm-explorer">
  <!-- Experimental warning -->
  <div class="bg-[#da3633]/10 border border-[#f85149] rounded-lg p-4 mb-6">
    <h2 class="text-[#f85149] font-bold text-sm mb-1">⚠ EXPERIMENTAL — LEARNING TOOL</h2>
    <p class="text-xs text-[#8b949e] leading-relaxed">
      An interactive explorer for <a href="https://centurymetadata.org" target="_blank" rel="noopener" class="text-[#58a6ff] hover:underline">centurymetadata</a> —
      a post-quantum metadata layer by Rusty Russell. Nothing here is production-ready. All data goes to the public test API.
      This is a proof-of-concept for learning how the system works.
    </p>
  </div>

  <TourMode {sections} onNavigate={scrollToSection} />

  <div class="flex gap-6">
    <!-- Sticky section nav -->
    <nav class="hidden md:block w-48 flex-shrink-0">
      <div class="sticky top-6 space-y-1">
        {#each sections as s}
          <button
            data-testid="cm-nav-{s.id}"
            onclick={() => scrollToSection(s.id)}
            class="w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center gap-2
              {activeSection === s.id
                ? 'bg-[#21262d] text-[#e6edf3] border-l-2 border-[#f78166]'
                : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] border-l-2 border-transparent'}"
          >
            <span class="text-sm">{s.icon}</span>
            <span class="font-medium">{s.num}. {s.label}</span>
          </button>
        {/each}
        <div class="pt-4 px-3 border-t border-[#21262d] mt-4">
          <div class="text-[10px] text-[#484f58] mb-1">your reader_id</div>
          <code class="text-[10px] text-[#a371f7] font-mono break-all">{readerIdHex.slice(0, 32)}...</code>
        </div>
      </div>
    </nav>

    <!-- Mobile section pills -->
    <div class="md:hidden fixed bottom-0 left-0 right-0 bg-[#0d1117] border-t border-[#21262d] z-50 flex overflow-x-auto">
      {#each sections as s}
        <button
          onclick={() => scrollToSection(s.id)}
          class="flex-shrink-0 px-3 py-3 text-[10px] transition-colors
            {activeSection === s.id ? 'text-[#f78166] border-b-2 border-[#f78166]' : 'text-[#8b949e] border-b-2 border-transparent'}"
        >
          {s.icon}<br/>{s.num}
        </button>
      {/each}
    </div>

    <!-- Main content -->
    <div class="flex-1 min-w-0 space-y-16 pb-20 md:pb-0">
      <!-- Section 1: Overview -->
      <div id="cm-section-overview" class="scroll-mt-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🌍</span>
            <h2 class="text-xl font-bold text-[#e6edf3]">The Big Picture</h2>
          </div>
          <p class="text-sm text-[#8b949e] leading-relaxed">
            <a href="https://centurymetadata.org" target="_blank" rel="noopener" class="text-[#58a6ff] hover:underline">centurymetadata</a>
            is a post-quantum key-value store designed by
            <a href="https://github.com/rustyrussell" target="_blank" rel="noopener" class="text-[#58a6ff] hover:underline">Rusty Russell</a>
            (Bitcoin Core, c-lightning). It stores encrypted records for <strong class="text-[#e6edf3]">100 years</strong>,
            using hybrid encryption so they stay confidential even if quantum computers break today's cryptography.
          </p>

          <!-- Visual system diagram -->
          <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-6 my-4">
            <pre class="text-[10px] sm:text-xs text-[#8b949e] font-mono leading-relaxed overflow-x-auto text-center">
┌─────────────────────────────────────────────────────────────────┐
│                    BIP-39 SEED PHRASE                            │
│          "abandon abandon abandon ... about"                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │
            ┌───────────┴───────────┐
            ▼                       ▼
   ┌─────────────────┐     ┌──────────────────────┐
   │  NIP-06 PATH    │     │  CM "D1TA" PATH      │
   │ m/44'/1237'/... │     │ m/0x44315441'/0'/... │
   │                 │     │                      │
   │  → Nostr identity│     │ → Writer key (sign)  │
   │  → Blossom auth  │     │ → Reader secp (ECDH) │
   │  → Cashu wallet  │     │ → Reader ML-KEM (PQ) │
   └─────────────────┘     └──────────┬───────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │   ENCRYPTED RECORD   │
                          │                      │
                          │  ECDH + ML-KEM + AES │
                          │  signed with Schnorr │
                          │  8192 bytes          │
                          └──────────┬───────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │   XOR-MASKED BUNDLE   │
                          │                      │
                          │  1024 slots × 8 KB   │
                          │  = 8 MB total        │
                          │  privacy in numbers  │
                          └──────────────────────┘
            </pre>
          </div>

          <!-- Key concepts -->
          <div class="grid sm:grid-cols-3 gap-3 mt-4">
            <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
              <div class="text-2xl mb-2">🔐</div>
              <h3 class="text-sm font-semibold text-[#e6edf3] mb-1">Hybrid Encryption</h3>
              <p class="text-[10px] text-[#8b949e] leading-relaxed">
                Classical (ECDH) + post-quantum (ML-KEM-1024). An attacker must break <strong class="text-[#e6edf3]">both</strong> to decrypt.
              </p>
            </div>
            <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
              <div class="text-2xl mb-2">🕵️</div>
              <h3 class="text-sm font-semibold text-[#e6edf3] mb-1">Privacy in Numbers</h3>
              <p class="text-[10px] text-[#8b949e] leading-relaxed">
                Everyone downloads the same 8 MB bundle. Only you can find and decrypt your records.
              </p>
            </div>
            <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
              <div class="text-2xl mb-2">⏳</div>
              <h3 class="text-sm font-semibold text-[#e6edf3] mb-1">Century-Scale</h3>
              <p class="text-[10px] text-[#8b949e] leading-relaxed">
                Designed for 100-year persistence. Post-quantum crypto ensures records survive the quantum era.
              </p>
            </div>
          </div>

          <NostrIdentity mnemonic={mnemonic} />

          <div class="bg-[#0d1117] border border-[#21262d] rounded-lg p-4">
            <p class="text-xs text-[#8b949e] leading-relaxed">
              <strong class="text-[#a371f7]">Scroll down</strong> to explore each part of the system interactively.
              Each section builds on the previous one. By the end, you'll understand how a seed phrase becomes
              an encrypted record in a shared bundle — and how only you can read it back.
            </p>
          </div>
        </div>
      </div>

      <!-- Section 2: Key Derivation -->
      <div id="cm-section-keys" class="scroll-mt-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🔑</span>
            <h2 class="text-xl font-bold text-[#e6edf3]">Keys & Identity</h2>
          </div>
          <p class="text-sm text-[#8b949e] leading-relaxed">
            One BIP-39 seed phrase creates <strong class="text-[#e6edf3]">two independent identity systems</strong>:
            your Nostr identity (for Blossom auth) and your centurymetadata identity (for encrypted records).
            They share a seed but are cryptographically independent.
          </p>

          <!-- Mnemonic input -->
          <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
            <label class="text-xs text-[#8b949e] font-medium">BIP-39 Mnemonic (your seed phrase)</label>
            <textarea
              bind:value={mnemonic}
              data-testid="cm-mnemonic"
              placeholder="Enter 12 or 24 words..."
              class="w-full bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none"
              rows="2"
            ></textarea>
            <div class="flex gap-2 flex-wrap">
              <button
                onclick={() => { mnemonic = ABANDON_12; handleDerive(); }}
                data-testid="cm-quickfill"
                class="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-[#58a6ff] rounded-md text-xs font-medium transition-colors"
              >⚡ Fill abandon×12</button>
              <button
                onclick={handleDerive}
                data-testid="cm-derive"
                class="px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded-md text-xs font-medium transition-colors"
              >Derive Keys</button>
            </div>
            {#if deriveError}
              <p class="text-xs text-[#f85149]">{deriveError}</p>
            {/if}
          </div>

          {#if keys}
            <!-- BIP-32 tree visualization -->
            <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
              <h3 class="text-sm font-semibold text-[#e6edf3] mb-3">BIP-32 Derivation Tree</h3>
              <pre class="text-[10px] text-[#8b949e] font-mono leading-relaxed overflow-x-auto">
BIP-39 Seed
│
├── m/44'/1237'/0'/0/0          <span class="text-[#3fb950]">→ Nostr identity (NIP-06)</span>
│   └── Used for Blossom auth, Nostr events
│
└── m/0x44315441'/0'            <span class="text-[#a371f7]">→ centurymetadata ("D1TA")</span>
    ├── /0'  Writer keypair     <span class="text-[#58a6ff]">→ BIP-340 Schnorr signing</span>
    ├── /1'  Reader secp256k1   <span class="text-[#58a6ff]">→ ECDH key exchange</span>
    └── /3'  Reader ML-KEM seed <span class="text-[#58a6ff]">→ Post-quantum encapsulation</span>
              </pre>
            </div>

            <!-- Derived keys display -->
            <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-semibold text-[#e6edf3]">Your centurymetadata Identity</h3>

              <div class="space-y-2 text-xs font-mono">
                <div>
                  <div class="text-[10px] text-[#484f58] mb-0.5">reader_id (your address in the bundle)</div>
                  <div class="text-[#a371f7] break-all bg-[#0d1117] rounded px-2 py-1">{readerIdHex}</div>
                  <div class="text-[10px] text-[#484f58] mt-0.5">= SHA256(reader_secp_pubkey ∥ reader_mlkem_pubkey)</div>
                </div>
                <div>
                  <div class="text-[10px] text-[#484f58] mb-0.5">writer_pubkey (signs your records)</div>
                  <div class="text-[#58a6ff] break-all bg-[#0d1117] rounded px-2 py-1">{writerPubHex}</div>
                  <div class="text-[10px] text-[#484f58] mt-0.5">= compressed secp256k1 public key</div>
                </div>
                <div>
                  <div class="text-[10px] text-[#484f58] mb-0.5">reader_secp_pubkey (for ECDH)</div>
                  <div class="text-[#58a6ff] break-all bg-[#0d1117] rounded px-2 py-1">{toHex(keys.readerSecpPubKey)}</div>
                </div>
                <div>
                  <div class="text-[10px] text-[#484f58] mb-0.5">mlkem_pubkey ({keys.mlkemPublicKey.length} bytes, post-quantum)</div>
                  <div class="text-[#58a6ff] break-all bg-[#0d1117] rounded px-2 py-1">{toHex(keys.mlkemPublicKey).slice(0, 64)}...</div>
                </div>
              </div>
            </div>

            <!-- Key insight callout -->
            <div class="bg-[#1c2128] border border-[#30363d] rounded-lg p-4">
              <p class="text-xs text-[#8b949e] leading-relaxed">
                <strong class="text-[#e6edf3]">💡 Key insight:</strong>
                The <code class="text-[#a371f7]">reader_id</code> is your "address" in the bundle.
                When someone writes a record for you, they encrypt it to your public keys and tag it with this hash.
                Anyone scanning the bundle can <em>see</em> that a record exists for this reader_id,
                but only your private keys can decrypt the contents.
              </p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Section 3: Record Anatomy -->
      <div id="cm-section-record" class="scroll-mt-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">📦</span>
            <h2 class="text-xl font-bold text-[#e6edf3]">Record Anatomy</h2>
          </div>
          <p class="text-sm text-[#8b949e] leading-relaxed">
            Every record in centurymetadata is exactly <strong class="text-[#e6edf3]">8192 bytes</strong>.
            Some fields are visible to everyone (cleartext); others are encrypted.
            Click each field below to learn what it does.
          </p>

          {#await import('./CmRecordAnatomy.svelte')}
            <div class="flex items-center gap-3 py-8 justify-center">
              <div class="w-5 h-5 rounded-full border-2 border-[#21262d] border-t-[#58a6ff] animate-spin"></div>
              <span class="text-xs text-[#8b949e]">Loading...</span>
            </div>
          {:then module}
            <module.default />
          {/await}
        </div>
      </div>

      <!-- Section 4: Encryption Pipeline -->
      <div id="cm-section-encryption" class="scroll-mt-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🔐</span>
            <h2 class="text-xl font-bold text-[#e6edf3]">How Encryption Works</h2>
          </div>
          <p class="text-sm text-[#8b949e] leading-relaxed">
            centurymetadata uses <strong class="text-[#e6edf3]">hybrid encryption</strong>: classical ECDH
            (broken by quantum computers) combined with ML-KEM-1024 (resistant to quantum computers).
            An attacker must break <strong class="text-[#e6edf3]">both</strong> systems to decrypt a record.
            Here's how a record gets encrypted, step by step.
          </p>

          {#if keys}
            {#await import('./CmEncryptionPipeline.svelte')}
              <div class="flex items-center gap-3 py-8 justify-center">
                <div class="w-5 h-5 rounded-full border-2 border-[#21262d] border-t-[#58a6ff] animate-spin"></div>
                <span class="text-xs text-[#8b949e]">Loading...</span>
              </div>
            {:then module}
              <module.default {keys} />
            {/await}
          {:else}
            <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 text-center">
              <p class="text-xs text-[#8b949e]">⚠ Derive keys in Section 2 first to see live encryption values.</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Section 5: Decryption -->
      <div id="cm-section-decryption" class="scroll-mt-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🔓</span>
            <h2 class="text-xl font-bold text-[#e6edf3]">How Decryption Works</h2>
          </div>
          <p class="text-sm text-[#8b949e] leading-relaxed">
            Encryption is only half the story — here's how the reader recovers the plaintext using their private keys.
            Every step reverses its encryption counterpart; the ECDH and ML-KEM secrets only materialize for the right reader.
          </p>

          {#if keys}
            {#await import('./CmDecryptionPipeline.svelte')}
              <div class="flex items-center gap-3 py-8 justify-center">
                <div class="w-5 h-5 rounded-full border-2 border-[#21262d] border-t-[#58a6ff] animate-spin"></div>
                <span class="text-xs text-[#8b949e]">Loading...</span>
              </div>
            {:then module}
              <module.default {keys} />
            {/await}
          {:else}
            <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 text-center">
              <p class="text-xs text-[#8b949e]">⚠ Derive keys in Section 2 first to see live decryption values.</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Section 6: Security Demos -->
      <div id="cm-section-security" class="scroll-mt-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🛡️</span>
            <h2 class="text-xl font-bold text-[#e6edf3]">Security Demos</h2>
          </div>
          <p class="text-sm text-[#8b949e] leading-relaxed">
            Two interactive proofs of centurymetadata's security properties: <strong class="text-[#e6edf3]">tamper detection</strong>
            (the signature catches any alteration) and <strong class="text-[#e6edf3]">wrong-reader confidentiality</strong>
            (a record not addressed to you is unfindable and undecryptable).
          </p>

          {#if keys}
            {#await import('./CmSecurityDemos.svelte')}
              <div class="flex items-center gap-3 py-8 justify-center">
                <div class="w-5 h-5 rounded-full border-2 border-[#21262d] border-t-[#58a6ff] animate-spin"></div>
                <span class="text-xs text-[#8b949e]">Loading...</span>
              </div>
            {:then module}
              <module.default {keys} />
            {/await}
          {:else}
            <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 text-center">
              <p class="text-xs text-[#8b949e]">⚠ Derive keys in Section 2 first.</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Section 7: Why Hybrid -->
      <div id="cm-section-whyhybrid" class="scroll-mt-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🧬</span>
            <h2 class="text-xl font-bold text-[#e6edf3]">Why Hybrid Crypto</h2>
          </div>
          <p class="text-sm text-[#8b949e] leading-relaxed">
            Two layers, two different mathematical assumptions — breaking a record means breaking both, and they fail in different futures.
          </p>
          {#await import('./WhyHybrid.svelte')}
            <div class="flex items-center gap-3 py-8 justify-center"><div class="w-5 h-5 rounded-full border-2 border-[#21262d] border-t-[#58a6ff] animate-spin"></div><span class="text-xs text-[#8b949e]">Loading...</span></div>
          {:then module}<module.default />{/await}
        </div>
      </div>

      <!-- Section 8: Browser Crypto -->
      <div id="cm-section-gotchas" class="scroll-mt-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🐞</span>
            <h2 class="text-xl font-bold text-[#e6edf3]">Browser Crypto Gotchas</h2>
          </div>
          <p class="text-sm text-[#8b949e] leading-relaxed">
            Porting centurymetadata from Node to the browser hit real, subtle bugs. Here's the gunzip-on-padded-data bug reproduced live, plus the API translations that made the port work.
          </p>
          {#await import('./BrowserGotchas.svelte')}
            <div class="flex items-center gap-3 py-8 justify-center"><div class="w-5 h-5 rounded-full border-2 border-[#21262d] border-t-[#58a6ff] animate-spin"></div><span class="text-xs text-[#8b949e]">Loading...</span></div>
          {:then module}<module.default />{/await}
        </div>
      </div>

      <!-- Section 9: Node vs Browser -->
      <div id="cm-section-nodevsbrowser" class="scroll-mt-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🔄</span>
            <h2 class="text-xl font-bold text-[#e6edf3]">Node vs Browser</h2>
          </div>
          <p class="text-sm text-[#8b949e] leading-relaxed">
            The same operation, side by side: the Node reference (<code class="text-[#a371f7]">test/roundtrip.mjs</code>) vs the browser lib. Byte-identical output, very different APIs.
          </p>
          {#await import('./NodeVsBrowser.svelte')}
            <div class="flex items-center gap-3 py-8 justify-center"><div class="w-5 h-5 rounded-full border-2 border-[#21262d] border-t-[#58a6ff] animate-spin"></div><span class="text-xs text-[#8b949e]">Loading...</span></div>
          {:then module}<module.default />{/await}
        </div>
      </div>

      <!-- Section 10: Bundle System -->
      <div id="cm-section-bundle" class="scroll-mt-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🌐</span>
            <h2 class="text-xl font-bold text-[#e6edf3]">The Bundle System</h2>
          </div>
          <p class="text-sm text-[#8b949e] leading-relaxed">
            Records aren't stored individually. Instead, <strong class="text-[#e6edf3]">1024 slots are XOR-masked</strong>
            into a single 8 MB bundle. Everyone downloads the same bundle; only your reader_id lets you find
            and decrypt your records within it. This provides <strong class="text-[#e6edf3]">privacy in numbers</strong> —
            the server can't tell which records are yours.
          </p>

          {#await import('./CmBundleSystem.svelte')}
            <div class="flex items-center gap-3 py-8 justify-center">
              <div class="w-5 h-5 rounded-full border-2 border-[#21262d] border-t-[#58a6ff] animate-spin"></div>
              <span class="text-xs text-[#8b949e]">Loading...</span>
            </div>
          {:then module}
            <module.default {networkSlots} {networkStats} {scanning} onRefresh={handleScan} />
          {/await}
        </div>
      </div>

      <!-- Section 8: Playground -->
      <div id="cm-section-playground" class="scroll-mt-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🎮</span>
            <h2 class="text-xl font-bold text-[#e6edf3]">Try It Yourself</h2>
          </div>
          <p class="text-sm text-[#8b949e] leading-relaxed">
            Write a real encrypted record to the centurymetadata test API, then fetch it back and watch it decrypt.
            Your data is encrypted in your browser before upload — the server never sees the plaintext.
          </p>

          {#if keys}
            {#await import('./CmPlayground.svelte')}
              <div class="flex items-center gap-3 py-8 justify-center">
                <div class="w-5 h-5 rounded-full border-2 border-[#21262d] border-t-[#58a6ff] animate-spin"></div>
                <span class="text-xs text-[#8b949e]">Loading...</span>
              </div>
            {:then module}
              <module.default {keys} />
            {/await}
          {:else}
            <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 text-center">
              <p class="text-xs text-[#8b949e]">⚠ Derive keys in Section 2 first.</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
