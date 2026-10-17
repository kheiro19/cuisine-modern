import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// ambientCG sends no CORS headers, so the browser cannot read its API or its files directly. The dev server and `vite preview`
// forward these two paths on its behalf (same origin for the page, nothing to install). See src/data/onlineConfig.ts.
const ambientProxy = {
  '/proxy/ambientcg': {
    target: 'https://ambientcg.com',
    changeOrigin: true,
    followRedirects: true, // /get?file=... answers with a redirect to the real file
    rewrite: (path: string) => path.replace(/^\/proxy\/ambientcg/, ''),
  },
  '/proxy/acgmedia': {
    target: 'https://f003.backblazeb2.com',
    changeOrigin: true,
    followRedirects: true,
    rewrite: (path: string) => path.replace(/^\/proxy\/acgmedia/, ''),
  },
};

// https://vitejs.dev
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  server: {
    port: 3000,
    host: true,
    open: true,
    proxy: ambientProxy,
  },
  preview: {
    proxy: ambientProxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000
  }
});
