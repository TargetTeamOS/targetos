import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      include: 'src/**/*.{jsx,js}',
    })
  ],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.js'],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Split vendor code into separate chunks so they can be cached independently
        manualChunks: {
          'react-vendor':   ['react', 'react-dom', 'react-router-dom'],
          'supabase':       ['@supabase/supabase-js'],
          'twilio-voice':   ['@twilio/voice-sdk'],
          'spreadsheet':    ['xlsx'],
          'sentry':         ['@sentry/react'],
          'analytics':      ['posthog-js'],
        },
      },
    },
    // Warn when any chunk exceeds 800KB (was 500KB default — too noisy)
    chunkSizeWarningLimit: 800,
  }
})
