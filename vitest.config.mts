import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const isCoverageRun = process.argv.some(
  (arg) => arg === '--coverage' || arg.startsWith('--coverage=')
)

const workspaceRoot = process.cwd()

export default defineConfig({
  test: {
    environment: 'jsdom',
    testTimeout: 15000,
    fileParallelism: !isCoverageRun,
    include: [
      'tests/**/*.test.js',
      'tests/**/*.test.ts',
      'packages/**/*.test.ts',
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx'
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
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      },
      include: ['packages/**/*.ts', 'apps/**/*.ts', 'apps/**/*.tsx'],
      // Process bootstraps, browser rendering, and PostgreSQL adapters have
      // dedicated smoke/E2E/integration gates. Keep them out of the unit
      // denominator so this threshold measures the deterministic core rather
      // than rewarding an unavailable external service or instrumenting a
      // process entrypoint that is exercised by a child process.
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/node_modules/**',
        '**/main.ts',
        '**/main.tsx',
        'apps/web/src/**',
        'packages/persistence/src/postgres.ts',
        'packages/persistence/src/*postgres*.ts',
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
      '@cvg/tools': resolve(workspaceRoot, 'packages/tools/src/index.ts'),
      '@cvg/agent-core': resolve(
        workspaceRoot,
        'packages/agent-core/src/index.ts'
      ),
      '@cvg/workflows': resolve(
        workspaceRoot,
        'packages/workflows/src/index.ts'
      ),
      '@cvg/adapters': resolve(workspaceRoot, 'packages/adapters/src/index.ts'),
      '@cvg/memory': resolve(workspaceRoot, 'packages/memory/src/index.ts'),
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
