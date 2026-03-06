import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Manual chunk splitting — keeps the initial JS payload small by
         * separating large, stable vendor libraries from app code.
         *
         * Strategy:
         *  - react-vendor: React + React DOM — the biggest and most stable chunk.
         *                  Kept together (not split further) to avoid the circular
         *                  dependency warning that arises when react-dom references
         *                  are resolved from different chunk groups.
         *  - ui-vendor:    All Radix primitives + cmdk (UI component libs)
         *  - tanstack:     @tanstack/react-table (data-grid logic, medium-sized)
         *  - lucide:       lucide-react icon library (tree-shaken but still notable)
         *  - vendor:       All remaining node_modules (next-themes, clsx, etc.)
         *  - index:        App code only — changes on every deploy
         */
        manualChunks(id: string) {
          // React core — must be a single chunk to avoid circular reference warnings
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-is/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          // UI primitives (Radix + cmdk share React context, keep together)
          if (
            id.includes('/node_modules/@radix-ui/') ||
            id.includes('/node_modules/radix-ui/') ||
            id.includes('/node_modules/cmdk/')
          ) {
            return 'ui-vendor';
          }
          // Data-grid
          if (id.includes('/node_modules/@tanstack/')) {
            return 'tanstack';
          }
          // Icons (large; tree-shaken by Vite but still significant)
          if (id.includes('/node_modules/lucide-react/')) {
            return 'lucide';
          }
          // Everything else in node_modules
          if (id.includes('/node_modules/')) {
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
