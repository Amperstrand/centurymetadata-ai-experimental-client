export interface SlotPublic {
  index: number;
  occupied: boolean;
  writerPubkey: string | null;
  writerXOnly: string | null;
  readerId: string | null;
  generation: number | null;
}

export interface NetworkStats {
  totalBundles: number;
  totalSlots: number;
  occupiedSlots: number;
  uniqueWriters: number;
  uniqueReaders: number;
}
