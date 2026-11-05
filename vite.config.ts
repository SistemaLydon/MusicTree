import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build:single` genera un único index.html autocontenido (se abre con doble clic)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  // Spotify solo acepta 127.0.0.1 (no localhost) como Redirect URI local
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: mode === 'single' ? { outDir: 'dist-single' } : {},
}))
