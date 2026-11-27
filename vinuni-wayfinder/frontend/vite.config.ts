import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { brand } from './src/shared/brand'
import { VitePWA } from 'vite-plugin-pwa'
import { mascotApi } from './server/mascotApi'

const wayfinderBackend = process.env.WAYFINDER_BACKEND || 'http://127.0.0.1:8000'
const wayfinderProxy = Object.fromEntries(
  [
    '/api/health',
    '/api/destinations',
    '/api/locate',
    '/api/correct',
    '/api/route',
    '/api/spots',
    '/api/site',
    '/api/maps',
    '/api/frames',
    '/api/traces',
    '/api/export',
    '/api/import',
    '/maps',
  ].map(path => [path, wayfinderBackend]),
)

export default defineConfig({
  plugins: [react(), mascotApi(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icons/*.png', 'favicon.svg', 'images/*.webp', 'pets/vini/*', 'pets/boba/*'],
    manifest: {
      id: '/',
      name: brand.name,
      short_name: brand.shortName,
      description: brand.description,
      lang: 'vi',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: brand.colors.background,
      background_color: brand.colors.background,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      globPatterns: ['**/*.{js,css,html,webp,png,svg,woff2}'],
      cleanupOutdatedCaches: true,
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api\//, /^\/maps\//],
    },
  })],
  server: { host: true, port: 5173, strictPort: true, proxy: wayfinderProxy },
})
