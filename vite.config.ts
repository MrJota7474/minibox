import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Rutas relativas: el mismo build funciona en Vercel y dentro del iframe de itch.io.
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  plugins: [
    VitePWA({
      // 'prompt': la actualización espera a que no haya partida en curso (ver Game.notifyUpdate).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'MiniBox',
        short_name: 'MiniBox',
        description: 'Simulador de dios por píxeles: crea mundos y mira cómo cobran vida.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#1a1410',
        theme_color: '#2b2118',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/world/**', 'src/entities/**', 'src/ai/**', 'src/sim/**', 'src/powers/**', 'src/input/gestures.ts', 'src/render/camera.ts'],
      exclude: ['src/core/device.ts'],
      reporter: ['text-summary', 'text'],
    },
  },
});
