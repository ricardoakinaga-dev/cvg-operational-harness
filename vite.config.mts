import { defineConfig } from 'vite'
import { resolveConsoleBuildProfile } from './apps/web/src/api/origin.ts'

const apiPort = process.env.CVG_API_PORT ?? '3100'
// SPEC0259 §4.6: an invalid or partial profile throws here, before any
// artifact is written.
const consoleProfile = resolveConsoleBuildProfile(process.env)

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
    ),
    __CVG_OPERATOR_LOGIN__: JSON.stringify(consoleProfile.login),
    __CVG_CONSOLE_ORIGIN__: JSON.stringify(consoleProfile.consoleOrigin),
    __CVG_API_ORIGIN__: JSON.stringify(consoleProfile.apiOrigin)
  },
  build:
    consoleProfile.login === 'oidc'
      ? {
          rollupOptions: {
            plugins: [
              {
                name: 'cvg-oidc-bundle-guard',
                // SPEC0259 §4.6 (DB3): the OIDC bundle never carries the
                // bootstrap token path.
                generateBundle(_options, bundle) {
                  for (const [name, output] of Object.entries(bundle)) {
                    const text =
                      output.type === 'chunk'
                        ? output.code
                        : typeof output.source === 'string'
                          ? output.source
                          : Buffer.from(output.source).toString('latin1')
                    for (const forbidden of [
                      '__CVG_OPERATOR_BOOTSTRAP_TOKEN',
                      'x-cvg-operator-token'
                    ]) {
                      if (text.includes(forbidden)) {
                        this.error(
                          `OIDC bundle ${name} contains the bootstrap token path`
                        )
                      }
                    }
                  }
                }
              }
            ]
          }
        }
      : {},
  server: {
    proxy: {
      '/v1': `http://127.0.0.1:${apiPort}`,
      '/health': `http://127.0.0.1:${apiPort}`
    }
  }
})
