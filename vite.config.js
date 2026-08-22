import {readFileSync} from 'node:fs'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {nodePolyfills} from 'vite-plugin-node-polyfills'
import {VitePWA} from 'vite-plugin-pwa'

const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
const commitRef = process.env.VITE_COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA || ''

// Serve and emit /version.json, and expose the version to the app as an env value. Importing
// package.json from src/ instead would inline the WHOLE manifest — every dependency and version —
// into the browser bundle. vercel.json already sends no-cache headers for /version.json.
function appVersionMetadataPlugin() {
  const payload = `${JSON.stringify({version: appVersion, commitRef: commitRef || undefined})}\n`
  return {
    name: 'bitbones-version-metadata',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.end(payload)
      })
    },
    generateBundle() {
      this.emitFile({type: 'asset', fileName: 'version.json', source: payload})
    },
  }
}

// vite 8 bundles with rolldown instead of rollup, and rolldown ignores optimizeDeps.esbuildOptions.
// @vitejs/plugin-react used to emit its automatic-JSX config there, which needed a local shim
// (adaptReactPluginForRolldown, ported from 5chan) to translate into optimizeDeps.rolldownOptions.
// As of @vitejs/plugin-react 6.1.0 the plugin emits rolldownOptions.transform.jsx itself, so the
// shim was a verified no-op and is gone. If plugin-react is ever pinned back below 6.1.0, JSX in
// prebundled deps breaks and the shim has to come back.

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },

  plugins: [
    appVersionMetadataPlugin(),

    // @vitejs/plugin-react 6 returns an array of plugins
    ...react(),

    // a lot of dependencies need node polyfills
    nodePolyfills(),

    // set up pwa / service worker
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        short_name: 'bitbones',
        name: 'bitbones',
        icons: [
          {
            src: 'manifest-icon-192x192.png',
            type: 'image/png',
            sizes: '192x192',
          },
          {
            src: 'manifest-icon-512x512.png',
            type: 'image/png',
            sizes: '512x512',
          },
        ],
        start_url: '.',
        display: 'standalone',
        theme_color: '#000000',
        background_color: '#aaaaaa',
      },
      workbox: {
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10mb
        runtimeCaching: [
          // cache the entire react app
          {
            urlPattern: ({url}) => url.origin === self.location.origin,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'everything-react-app-cache',
              expiration: {
                maxEntries: 500,
                // never expire the cache in case server goes down
                maxAgeSeconds: undefined,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],

  // electron uses file:// urls, so need base ./
  base: './',

  build: {
    // usually vite uses 'dist', but we want to use 'dist' for electron
    outDir: 'build',

    // don't include sourcemap in the electron app or ipfs build
    sourcemap: process.env.GENERATE_SOURCEMAP === 'true' ? true : undefined,

    // try to support as old browsers as possible
    target: ['chrome67', 'edge79', 'firefox68', 'opera54', 'safari14'],
  },
})
