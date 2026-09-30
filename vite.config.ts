// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // Allows testing on local network tablets/devices
    open: true, // Automatically opens the browser on server boot
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // Disables sourcemaps for production performance optimization
    chunkSizeWarningLimit: 1000, // Optimizes chunks limit for Three.js bundle size
  },
});
