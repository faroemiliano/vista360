import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1', port: 5174, strictPort: true,
    // Permite probar enlaces públicos en la red local con VITE_API_BASE_URL=/.
    proxy: { '^/api/v1/public/(tours/|media/)': { target: 'http://127.0.0.1:8001', changeOrigin: true } },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
})
