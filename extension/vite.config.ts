import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';

export default defineConfig({
  // Use relative paths for Chrome extension compatibility
  base: './',
  plugins: [
    react(),
    // Post-build fixes for Chrome extension
    {
      name: 'chrome-extension-fix',
      closeBundle() {
        // Copy manifest
        copyFileSync(
          resolve(__dirname, 'src/manifest.json'),
          resolve(__dirname, 'dist/manifest.json')
        );

        // Copy icons
        const srcIconsDir = resolve(__dirname, 'src/icons');
        const distIconsDir = resolve(__dirname, 'dist/icons');
        if (!existsSync(distIconsDir)) {
          mkdirSync(distIconsDir, { recursive: true });
        }
        if (existsSync(srcIconsDir)) {
          for (const file of readdirSync(srcIconsDir)) {
            copyFileSync(
              resolve(srcIconsDir, file),
              resolve(distIconsDir, file)
            );
          }
        }

        // Fix sidepanel HTML - copy to correct location and fix paths
        const srcHtml = resolve(__dirname, 'dist/src/sidepanel/index.html');
        const destHtml = resolve(__dirname, 'dist/sidepanel/index.html');
        if (existsSync(srcHtml)) {
          let html = readFileSync(srcHtml, 'utf-8');
          // Fix paths from ../../ to ./ for sidepanel location
          html = html.replace(/src="\.\.\/\.\.\/sidepanel\//g, 'src="./');
          html = html.replace(/href="\.\.\/\.\.\/assets\//g, 'href="../assets/');
          writeFileSync(destHtml, html);
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Don't minify for Chrome extension compatibility
    minify: false,
    rollupOptions: {
      input: {
        'sidepanel/index': resolve(__dirname, 'src/sidepanel/index.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'content/recorder': resolve(__dirname, 'src/content/recorder.ts'),
        'content/highlighter': resolve(__dirname, 'src/content/highlighter.ts'),
        'content/journey-player': resolve(__dirname, 'src/content/journey-player.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
