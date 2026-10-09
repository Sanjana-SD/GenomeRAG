import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In dev, /api and /health are proxied to the FastAPI backend, so no CORS is involved.
// Set VITE_API_URL to call a backend on another origin directly (it must allow that origin in CORS_ORIGINS).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.BACKEND_URL || 'http://127.0.0.1:8000'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: { '/api': target, '/health': target },
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: { charts: ['recharts'], vendor: ['react', 'react-dom', 'lucide-react'] },
        },
      },
    },
  }
})
