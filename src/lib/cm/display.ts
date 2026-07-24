import { PREAMBLE } from './constants.js';

export function preambleText(): string {
  return new TextDecoder().decode(PREAMBLE);
}

export function preambleLength(): number {
  return PREAMBLE.length;
}

export function writerToColor(writerPubkeyHex: string): string {
  const r = parseInt(writerPubkeyHex.slice(2, 4), 16);
  const g = parseInt(writerPubkeyHex.slice(4, 6), 16);
  const b = parseInt(writerPubkeyHex.slice(6, 8), 16);
  return `rgb(${r}, ${g}, ${b})`;
}
