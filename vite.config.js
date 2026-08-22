import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {nodePolyfills} from 'vite-plugin-node-polyfills'
import {VitePWA} from 'vite-plugin-pwa'

// vite 8 bundles with rolldown instead of rollup, and rolldown does not honor
// optimizeDeps.esbuildOptions. @vitejs/plugin-react still emits its automatic-JSX config there, so
// translate it into the rolldown equivalent. Ported from 5chan/vite.config.js.
function adaptReactPluginForRolldown(plugin) {
  if (!plugin?.config || plugin.name !== 'vite:react-babel') {
    return plugin
  }

  return {
    ...plugin,
    async config(userConfig, configEnv) {
      const config = await plugin.config.call(this, userConfig, configEnv)
      const optimizeDeps = config?.optimizeDeps

      if (optimizeDeps?.esbuildOptions?.jsx !== 'automatic') {
        return config
      }

      const {esbuildOptions, ...remainingOptimizeDeps} = optimizeDeps

      return {
        ...config,
        optimizeDeps: {
          ...remainingOptimizeDeps,
          rolldownOptions: {
            ...optimizeDeps.rolldownOptions,
            transform: {
              ...optimizeDeps.rolldownOptions?.transform,
              jsx: optimizeDeps.rolldownOptions?.transform?.jsx ?? {runtime: 'automatic'},
            },
          },
        },
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // @vitejs/plugin-react 6 returns an array of plugins
    ...react().map(adaptReactPluginForRolldown),

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
