import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  publicDir: 'static',
  resolve: {
    extensions: ['.ts', '.svelte.ts', '.js', '.svelte.js', '.svelte', '.json'],
  },
  plugins: [svelte(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
