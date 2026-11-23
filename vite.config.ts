import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// HTTPS ist nötig, damit das Handy im WLAN Kamera und Sensoren freigibt.
const useHttps = (process.env.SB_HTTP ?? process.env.PHANTOM_HTTP) !== '1';

export default defineConfig({
  plugins: [
    react(),
    ...(useHttps ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'models/movenet/*'],
      manifest: {
        name: 'Shadow Burn',
        short_name: 'Shadow Burn',
        description: 'Offline-Sport-App mit Kamera-Wiederholungszählung',
        lang: 'de',
        theme_color: '#07090c',
        background_color: '#07090c',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2,json,bin,mp4,jpg,webp,png}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  server: { host: true },
  test: { environment: 'node' },
});
