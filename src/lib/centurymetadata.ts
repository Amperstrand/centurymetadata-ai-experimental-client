/**
 * centurymetadata browser-compatible encode/decode — barrel re-export.
 *
 * The implementation is split into focused modules under src/lib/cm/.
 * This file re-exports everything for backwards compatibility with
 * existing imports: `import { encodeRecord } from '../lib/centurymetadata'`
 *
 * @see src/lib/cm/ for the actual implementation modules.
 */
export * from './cm/index.js';
