import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  define: {
    __BUILD_VERSION__: JSON.stringify(Date.now().toString(36)),
  },
  plugins: [react()],
  build: {
    // ECharts is kept as one cacheable, eagerly requested dashboard dependency.
    // Its current production size is ~589 kB minified / ~198 kB gzip; warn if
    // any JavaScript chunk grows beyond the 600 kB budget.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|react-router)[\\/]/,
              priority: 30,
            },
            {
              name: 'echarts-vendor',
              test: /node_modules[\\/](echarts|zrender)[\\/]/,
              priority: 20,
            },
            {
              name: 'canvas-vendor',
              test: /node_modules[\\/](konva|react-konva)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
})
