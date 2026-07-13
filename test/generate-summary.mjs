import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const RESULTS_DIR = process.argv[2] || 'test-results';
const reportPath = join(RESULTS_DIR, 'report.json');

if (!existsSync(reportPath)) {
  console.error('No report.json found in', RESULTS_DIR);
  process.exit(0);
}

const report = JSON.parse(readFileSync(reportPath, 'utf-8'));

const passed = report.stats?.expected ?? 0;
const failed = (report.stats?.unexpected ?? 0) + (report.stats?.flaky ?? 0);
const skipped = report.stats?.skipped ?? 0;
const total = passed + failed + skipped;
const outcome = failed === 0 ? 'passed' : 'failed';

const MIME_MAP = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webm': 'video/webm',
  '.zip': 'application/zip',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else {
      const mime = MIME_MAP[extname(entry)] || 'application/octet-stream';
      files.push({ path: relative(RESULTS_DIR, full), mime, size: statSync(full).size });
    }
  }
}
walk(RESULTS_DIR);

const summary = {
  outcome,
  passed,
  failed,
  skipped,
  total,
  counts: { passed, failed, skipped, total },
  duration: report.stats?.duration ?? 0,
  files,
};

writeFileSync(join(RESULTS_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`summary.json: ${outcome} (${passed} passed, ${failed} failed, ${skipped} skipped, ${total} total, ${files.length} files)`);
