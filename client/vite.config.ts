import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:5000',
      '/migrations': 'http://localhost:5000',
      '/drive': 'http://localhost:5000',
    },
  },
})
