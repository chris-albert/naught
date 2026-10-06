import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The sign-in routes are Pages Functions; `pnpm functions` serves them locally.
  server: { proxy: { '/auth': 'http://localhost:8788' } },
})
