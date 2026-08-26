import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Only the GEMINI_* keys are read, so an unrelated secret in .env is never
    // pulled into the bundle by accident.
    const env = loadEnv(mode, '.', 'GEMINI_');
    const apiKey = env.GEMINI_API_KEY ?? '';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Falls back to '' so a missing key compiles to a falsy literal rather
        // than the bare identifier `undefined`, which would throw at runtime.
        'process.env.API_KEY': JSON.stringify(apiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(apiKey)
      },
      build: {
        // jsPDF + html2canvas are dynamically imported by the briefing export,
        // so Rollup already splits them out; this only isolates the React
        // runtime, which changes far less often than app code.
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom'],
              genai: ['@google/genai'],
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
