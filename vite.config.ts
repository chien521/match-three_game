import { defineConfig } from 'vite';

// Base is relative so the build drops cleanly into a GitHub Pages project
// subpath (or any other static host / VIVERSE bundle) without hardcoding a path.
export default defineConfig({
  base: './',
  build: {
    // Phaser itself is a large, mostly-static vendor dependency — split it
    // into its own chunk so it's cached independently from our game code
    // (which changes far more often) and no longer trips the default
    // chunk-size warning meant for app code bloat.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/phaser')) {
            return 'phaser';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
});
