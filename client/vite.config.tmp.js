import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Temporary config used only to preview against a backend on 4001 while port
// 4000 is occupied by another project. Safe to delete.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:4001',
      '/uploads': 'http://localhost:4001',
    },
  },
});
