import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  define: {
    __BUILD_VERSION__: JSON.stringify(Date.now().toString(36)),
  },
  plugins: [react()],
})
