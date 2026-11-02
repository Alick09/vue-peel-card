import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Library build: ESM + UMD, vue stays an external dependency.
// The component styles are inline, there is no separate CSS file.
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'VuePeelCard',
      formats: ['es', 'umd'],
      fileName: format => (format === 'es' ? 'vue-peel-card.js' : 'vue-peel-card.umd.cjs'),
    },
    rollupOptions: {
      external: ['vue'],
      output: { globals: { vue: 'Vue' }, exports: 'named' },
    },
  },
})
