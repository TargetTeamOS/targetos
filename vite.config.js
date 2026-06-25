import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      include: 'src/**/*.{jsx,js}',  // Only process src/ not api/
    })
  ],
  build: { outDir: 'dist' }
})
