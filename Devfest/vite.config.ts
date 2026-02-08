import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  // Frontend reads shared VITE_* vars from repo root .env.
  envDir: path.resolve(__dirname, '..'),
  plugins: [react()],
  server: {
    hmr: {
      overlay: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Ensure proper module resolution
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React and core libraries
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // React Query
          'react-query': ['@tanstack/react-query'],
          // State management
          'state-vendor': ['zustand'],
          // Form handling
          'form-vendor': ['react-hook-form', 'zod', '@hookform/resolvers'],
          // UI libraries
          'ui-vendor': ['framer-motion', 'lucide-react'],
          // Charts
          'charts-vendor': ['recharts'],
          // Markdown
          'markdown-vendor': ['react-markdown'],
          // Utilities
          'utils-vendor': ['axios', 'date-fns'],
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Increase limit since we're splitting chunks
  },
})
