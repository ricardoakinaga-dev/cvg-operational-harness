import { defineConfig } from 'vite'

const apiPort = process.env.CVG_API_PORT ?? '3100'

export default defineConfig({
  define: {
    __CVG_WEB_IDENTITY_MODE__: JSON.stringify(
      process.env.VITE_CVG_WEB_IDENTITY_MODE ?? ''
    ),
    __CVG_WEB_CONTROLLED_TEST__: JSON.stringify(
      process.env.VITE_CVG_CONTROLLED_TEST === 'true'
    ),
    __CVG_WEB_MODE__: JSON.stringify(
      process.env.NODE_ENV === 'test' ? 'test' : 'production'
    )
  },
  server: {
    proxy: {
      '/v1': `http://127.0.0.1:${apiPort}`,
      '/health': `http://127.0.0.1:${apiPort}`
    }
  }
})
