import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const isCoverageRun = process.argv.some(
  (arg) => arg === '--coverage' || arg.startsWith('--coverage=')
)

const workspaceRoot = process.cwd()

// HISO-010: the harness CI bar runs every Vitest invocation (its own unit and
// coverage gates and the ones nested in `certify`) with CVG_TEST_SCOPE=core,
// so consumer products under products/** never enter the harness test or
// coverage denominators; each product is tested by its own workflow. Unset
// keeps the aggregated transition regression of ADR-010 criterion 5, which
// is also what the product's path-filtered `npm test --workspace` relies on.
const testScope = process.env.CVG_TEST_SCOPE || 'all'
if (testScope !== 'all' && testScope !== 'core') {
  throw new Error(`invalid CVG_TEST_SCOPE: ${testScope} (expected all|core)`)
}
const productGlobs = (...extensions: string[]) =>
  testScope === 'core'
    ? []
    : extensions.map((extension) => `products/**/*${extension}`)

export default defineConfig({
  define: {
    __CVG_WEB_IDENTITY_MODE__: JSON.stringify(
      process.env.VITE_CVG_WEB_IDENTITY_MODE ?? ''
    ),
    __CVG_WEB_CONTROLLED_TEST__: 'true',
    __CVG_WEB_MODE__: JSON.stringify('test')
  },
  test: {
    environment: 'jsdom',
    testTimeout: 15000,
    fileParallelism: !isCoverageRun,
    include: [
      'tests/**/*.test.js',
      'tests/**/*.test.ts',
      'packages/**/*.test.ts',
      'legacy/**/*.test.ts',
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
      ...productGlobs('.test.ts', '.test.tsx')
    ],
    server: {
      deps: {
        inline: [/^@cvg\//]
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90
      },
      include: [
        'packages/**/*.ts',
        'legacy/**/*.ts',
        'apps/**/*.ts',
        'apps/**/*.tsx',
        ...productGlobs('.ts', '.tsx')
      ],
      // Process bootstraps, browser rendering, and PostgreSQL adapters have
      // dedicated smoke/E2E/integration gates. Keep them out of the unit
      // denominator so this threshold measures the deterministic core rather
      // than rewarding an unavailable external service or instrumenting a
      // process entrypoint that is exercised by a child process.
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/node_modules/**',
        '**/dist/**',
        '**/main.ts',
        '**/main.tsx',
        'apps/web/src/**',
        'packages/persistence/src/postgres.ts',
        'packages/persistence/src/*postgres*.ts',
        'legacy/packages/secretary-journeys/src/postgres-repository.ts',
        'packages/persistence/src/platform-control-plane-repository.ts',
        'packages/persistence/src/platform-approval-repository.ts',
        'packages/persistence/src/tenant-scoped-capability-approval-repository.ts'
      ]
    }
  },
  ssr: {
    noExternal: [/^@cvg\//]
  },
  resolve: {
    alias: {
      '@cvg/harness-contracts': resolve(
        workspaceRoot,
        'packages/contracts/src/index.ts'
      ),
      '@cvg/harness-orchestrator': resolve(
        workspaceRoot,
        'packages/orchestrator/src/index.ts'
      ),
      '@cvg/harness': resolve(workspaceRoot, 'packages/harness/src/index.ts'),
      '@cvg/shared': resolve(workspaceRoot, 'packages/shared/src/index.ts'),
      '@cvg/persistence': resolve(
        workspaceRoot,
        'packages/persistence/src/index.ts'
      ),
      '@cvg/policy': resolve(workspaceRoot, 'packages/policy/src/index.ts'),
      '@cvg/agent-core': resolve(
        workspaceRoot,
        'packages/agent-core/src/index.ts'
      ),
      '@cvg/legacy-secretary-evals': resolve(
        workspaceRoot,
        'legacy/packages/secretary-evals/src/index.ts'
      ),
      '@cvg/legacy-secretary-journeys': resolve(
        workspaceRoot,
        'legacy/packages/secretary-journeys/src/index.ts'
      ),
      '@cvg/legacy-secretary-profile': resolve(
        workspaceRoot,
        'legacy/packages/secretary-profile/src/index.ts'
      ),
      '@cvg/adapters': resolve(workspaceRoot, 'packages/adapters/src/index.ts'),
      '@cvg/rag': resolve(workspaceRoot, 'packages/rag/src/index.ts'),
      '@cvg/platform': resolve(workspaceRoot, 'packages/platform/src/index.ts'),
      '@cvg/model-gateway': resolve(
        workspaceRoot,
        'packages/model-gateway/src/index.ts'
      ),
      '@cvg/policy-engine': resolve(
        workspaceRoot,
        'packages/policy-engine/src/index.ts'
      ),
      '@cvg/approval-engine': resolve(
        workspaceRoot,
        'packages/approval-engine/src/index.ts'
      ),
      '@cvg/channel-gateway': resolve(
        workspaceRoot,
        'packages/channel-gateway/src/index.ts'
      ),
      '@cvg/observability': resolve(
        workspaceRoot,
        'packages/observability/src/index.ts'
      ),
      '@cvg/agent-runtime': resolve(
        workspaceRoot,
        'packages/agent-runtime/src/index.ts'
      ),
      '@cvg/agent-evals': resolve(
        workspaceRoot,
        'packages/agent-evals/src/index.ts'
      ),
      '@cvg/chaos': resolve(workspaceRoot, 'packages/chaos/src/index.ts')
    }
  }
})
