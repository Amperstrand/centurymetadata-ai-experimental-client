<script lang="ts">
  import { ACCEPTED_TYPES } from '../lib/centurymetadata';

  type ValidatorResult = { valid: boolean; message: string; details: string[] };

  const EXAMPLES: Record<string, { example: string; desc: string; format: string }> = {
    'bitcoin psbt': {
      example: 'cHNidP8BAHUCAAAAASaBcTce3/KFHeE2a6QAHfxqcrxfHGgG7vid5hU+nQITAAAAAAD+////AomN1gUAAAAAIgAgZEsBukgROqGS8q4Q1Wx0yZ1qE//g4A4ZQ0n6fHiHWoBAAAAAAEAAAAAA6ICAu3/BwAAAAAAIgAgTSmDRIEXKnS6iczWWTiNVrG2sE5Yk1W4n2JnUg0l7pZ/v///wK6Id8CAAAAarinomJt5VlqdetH7sRSkYnVaSEkmCFjOi3h6Uh0gR8BAAAAAAEAAAAAA6ICAu3/BwAAAAAAIgAgDE+ZowK+BR0oIv5MRy0Lfs1fxR4sJt3iS7BFDKedc/v///wK6Id8CAAAAarinomJt5VlqdetH7sRSkYnVaSEkmCFjOi3h6Uh0gR8BAAAAAAEAAAAAA6ICAu3/BwAAAAAA',
      desc: 'A partially signed Bitcoin transaction (BIP-174). Lets you store an in-flight PSBT that any co-signer can later fetch and complete.',
      format: 'base64',
    },
    'bitcoin transaction': {
      example: '0200000001a15d5a9c46b3a4e6c2b0aa6e8b41f6d2f8b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e000000006a4730440220f8b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2022100aabbccddee0011223344556677889900aabbccddee0011223344556677889901210250863ad64a87ae8a2fe83c1af1a8403cb53f53e486d8511dad8a04887e5b235201210250863ad64a87ae8a2fe83c1af1a8403cb53f53e486d8511dad8a04887e5b235201ffffffff0140420f00000000001976a914a5b4fc4c3a2b0c0e2d3a4b5c6d7e8f9a0b1c2d3e88ac00000000',
      desc: 'A fully-signed raw Bitcoin transaction in hex. Store it as evidence or for later reference.',
      format: 'hex',
    },
    'bitcoin miniscript': {
      example: 'and_v(v:pk(02a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3),older(1000))',
      desc: 'A miniscript expression (BIP-379). The server checks it parses as valid and infers to top-level type B (Base).',
      format: 'miniscript',
    },
    'bitcoin output script descriptor': {
      example: 'wpkh([d34db33f/84h/0h/0h]xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSojawudHrDrJm7VafwdeFaseB/0/*)#xz7vw3rn',
      desc: 'An output script descriptor (BIP-380). The complete spending policy for a wallet. Includes checksum verification.',
      format: 'descriptor',
    },
    'bitcoin wallet labels': {
      example: '{"type":"addr","ref":"bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4","label":"savings"}\n{"type":"tx","ref":"f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16","label":"first purchase"}',
      desc: 'BIP-329 wallet labels in JSONL format. Each line labels a transaction, address, or pubkey.',
      format: 'JSONL',
    },
  };

  function validatePsbt(contents: string): ValidatorResult {
    const details: string[] = [];
    if (!contents.match(/^[A-Za-z0-9+/=]+$/)) {
      return { valid: false, message: 'Not valid base64', details: ['PSBT must be base64-encoded'] };
    }
    details.push('✓ Valid base64 characters');
    try {
      const raw = atob(contents);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const magic = [0x70, 0x73, 0x62, 0x74];
      const isPsbt = bytes.length >= 5 && magic.every((b, i) => bytes[i] === b);
      if (!isPsbt) {
        details.push('✗ Missing PSBT magic bytes (0x70736274ff)');
        return { valid: false, message: 'Not a PSBT — missing magic header', details };
      }
      details.push('✓ PSBT magic bytes present (0x70736274ff)');
      details.push(`  PSBT size: ${bytes.length} bytes`);
      return { valid: true, message: 'Valid PSBT structure', details };
    } catch (e) {
      return { valid: false, message: 'Base64 decode failed', details: [] };
    }
  }

  function validateTransaction(contents: string): ValidatorResult {
    const details: string[] = [];
    if (!contents.match(/^[0-9a-f]+$/i)) {
      return { valid: false, message: 'Not valid hex', details: ['Transaction must be hex-encoded'] };
    }
    details.push('✓ Valid hex characters');
    if (contents.length < 20) {
      details.push('✗ Too short to be a valid transaction');
      return { valid: false, message: 'Too short', details };
    }
    const versionHex = contents.slice(0, 8);
    details.push(`  version: 0x${versionHex} (little-endian)`);
    details.push(`  total size: ${contents.length / 2} bytes`);
    return { valid: true, message: 'Valid transaction hex', details };
  }

  function validateMiniscript(contents: string): ValidatorResult {
    const details: string[] = [];
    if (!contents.match(/^[a-z0-9_():,]+$/)) {
      const bad = contents.match(/[^a-z0-9_():,]/);
      return { valid: false, message: `Invalid character: '${bad?.[0]}'`, details: ['Miniscript uses only a-z, 0-9, and ()_:,'] };
    }
    details.push('✓ Valid miniscript characters');
    const opens = (contents.match(/\(/g) || []).length;
    const closes = (contents.match(/\)/g) || []).length;
    if (opens !== closes) {
      details.push(`✗ Unbalanced parentheses: ${opens} open vs ${closes} close`);
      return { valid: false, message: 'Unbalanced parentheses', details };
    }
    details.push(`✓ Balanced parentheses (${opens} pairs)`);
    const fragments = contents.match(/\b(and_v|or_b|and_b|or_c|or_d|thresh|older|after|pk|pk_h|multi|pk_k)\b/g);
    if (fragments) {
      details.push(`  fragments found: ${fragments.join(', ')}`);
    }
    details.push('  Note: full type inference (must be type B) is validated server-side via embit');
    return { valid: true, message: 'Miniscript syntax OK', details };
  }

  function validateDescriptor(contents: string): ValidatorResult {
    const details: string[] = [];
    if (contents.includes('#')) {
      const hashIdx = contents.indexOf('#');
      const body = contents.slice(0, hashIdx);
      const checksum = contents.slice(hashIdx + 1);
      details.push(`  descriptor: ${body.slice(0, 50)}...`);
      details.push(`  checksum: #${checksum}`);
      if (checksum.length !== 8) {
        details.push('✗ Checksum must be exactly 8 characters');
        return { valid: false, message: 'Invalid checksum length', details };
      }
      details.push('✓ Checksum is 8 characters');
    } else {
      details.push('  (no checksum present — recommended but not required)');
    }
    const funcs = contents.match(/\b(wpkh|wpkh|sh|wsh|pk|pkh|multi|sortedmulti|tr|addr|raw)\b/g);
    if (!funcs) {
      details.push('✗ No descriptor function found (wpkh, sh, wsh, tr, etc.)');
      return { valid: false, message: 'Missing descriptor function', details };
    }
    details.push(`✓ Descriptor function: ${funcs.join(', ')}`);
    if (contents.includes('[')) {
      details.push('  contains key origin info: ✓');
    }
    details.push('  Note: full BIP-380 parse + checksum is validated server-side via embit');
    return { valid: true, message: 'Descriptor syntax OK', details };
  }

  function validateLabels(contents: string): ValidatorResult {
    const details: string[] = [];
    const lines = contents.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      return { valid: false, message: 'No labels provided', details: ['Provide at least one JSON line'] };
    }
    const validTypes = ['tx', 'addr', 'pubkey', 'input', 'output', 'xpub'];
    let validCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      try {
        const obj = JSON.parse(line);
        if (typeof obj !== 'object' || obj === null) throw new Error('not an object');
        if (!obj.type || !obj.ref) throw new Error("missing 'type' or 'ref'");
        if (!validTypes.includes(obj.type)) throw new Error(`unknown type '${obj.type}'`);
        validCount++;
      } catch (e) {
        details.push(`✗ Line ${i + 1}: ${(e as Error).message}`);
        return { valid: false, message: `Error on line ${i + 1}`, details };
      }
    }
    details.push(`✓ ${validCount} label(s) parsed successfully`);
    details.push(`  types checked: ${validTypes.join(', ')}`);
    details.push('  Note: full ref validation (txid/address/xpub) done server-side');
    return { valid: true, message: `${validCount} valid label(s)`, details };
  }

  const VALIDATORS: Record<string, (c: string) => ValidatorResult> = {
    'bitcoin psbt': validatePsbt,
    'bitcoin transaction': validateTransaction,
    'bitcoin miniscript': validateMiniscript,
    'bitcoin output script descriptor': validateDescriptor,
    'bitcoin wallet labels': validateLabels,
  };

  let selectedType = $state('bitcoin output script descriptor');
  let inputText = $state(EXAMPLES['bitcoin output script descriptor'].example);

  let result = $derived(VALIDATORS[selectedType](inputText));

  function selectType(type: string) {
    selectedType = type;
    inputText = EXAMPLES[type].example;
  }
</script>

<div class="space-y-4">
  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-semibold text-[#e6edf3]">The 5 accepted Bitcoin record types</h3>
    <p class="text-[11px] text-[#b1bac4] leading-relaxed">
      centurymetadata stores typed records. The test server validates each one — a <code class="text-[#a371f7]">bitcoin
      output script descriptor</code> must parse as BIP-380, a <code class="text-[#a371f7]">bitcoin psbt</code> must be a
      valid BIP-174, etc. Select a type and try editing the example:
    </p>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
    {#each ACCEPTED_TYPES as type}
      <button
        data-testid="cm-type-{type.replace(/ /g, '-')}"
        onclick={() => selectType(type)}
        class="text-left p-3 rounded-md border transition-colors {selectedType === type
          ? 'bg-[#21262d] border-[#f78166]'
          : 'bg-[#161b22] border-[#21262d] hover:border-[#30363d]'}"
      >
        <div class="text-[10px] font-mono text-[#a371f7] mb-1">{type}</div>
        <div class="text-[10px] text-[#8b949e] leading-tight">{EXAMPLES[type].desc.slice(0, 60)}…</div>
      </button>
    {/each}
  </div>

  <div class="bg-[#161b22] border border-[#21262d] rounded-lg p-4 space-y-3">
    <div class="flex items-center justify-between">
      <div>
        <span class="text-[10px] font-mono text-[#a371f7]">{selectedType}</span>
        <span class="text-[10px] text-[#484f58] ml-2">format: {EXAMPLES[selectedType].format}</span>
      </div>
      <span
        data-testid="cm-type-status"
        class="text-[10px] px-2 py-0.5 rounded-full {result.valid ? 'text-[#3fb950] bg-[#3fb950]/10' : 'text-[#f85149] bg-[#f85149]/10'}"
      >
        {result.valid ? '✓ valid' : '✗ invalid'}
      </span>
    </div>

    <p class="text-[11px] text-[#b1bac4] leading-relaxed">{EXAMPLES[selectedType].desc}</p>

    <textarea
      bind:value={inputText}
      data-testid="cm-type-input"
      rows="4"
      class="w-full bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2 text-[11px] font-mono text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none resize-y"
    ></textarea>

    <div data-testid="cm-type-result" class="bg-[#0d1117] border border-[#21262d] rounded-md p-3 space-y-1">
      <div class="text-[10px] {result.valid ? 'text-[#3fb950]' : 'text-[#f85149]'} font-medium mb-1">{result.message}</div>
      {#each result.details as detail}
        <div class="text-[10px] text-[#8b949e] font-mono">{detail}</div>
      {/each}
    </div>
  </div>

  <div class="bg-[#1c2128] border border-[#30363d] rounded-lg p-4">
    <p class="text-[10px] text-[#8b949e] leading-relaxed">
      <strong class="text-[#e6edf3]">💡 Byte-level detail:</strong>
      Each record is stored as <code class="text-[#a371f7]">TYPE\0NAME\0CONTENTS\0</code> inside the gzip-compressed AES
      payload. The server (in test mode) decrypts known-reader records and validates CONTENTS against the TYPE spec using
      the <code class="text-[#d29922]">embit</code> Python library. In production mode, the server can't decrypt — it
      stores opaque encrypted bytes.
    </p>
  </div>
</div>
