import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

// When set (e.g. by `make localexplorer` in the parent centurymetadata repo),
// proxy /cm/* to a local centurymetadata server instead of relying on the
// Cloudflare Pages Function (functions/cm/[[path]].ts) that only runs under
// `wrangler pages dev` / an actual deployment.
const localApi = process.env.CM_LOCAL_API;

export default defineConfig({
  publicDir: 'static',
  resolve: {
    extensions: ['.ts', '.svelte.ts', '.js', '.svelte.js', '.svelte', '.json'],
  },
  plugins: [svelte(), tailwindcss()],
  server: localApi
    ? {
        proxy: {
          '/cm': {
            target: localApi,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/cm/, ''),
          },
        },
      }
    : undefined,
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
