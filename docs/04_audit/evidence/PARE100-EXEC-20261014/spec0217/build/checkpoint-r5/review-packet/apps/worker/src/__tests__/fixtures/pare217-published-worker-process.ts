import { readFile } from 'node:fs/promises'
import {
  createControlledCapabilityGateway,
  DeterministicModelProvider,
  CapabilityGateway,
  type AgentConfig
} from '@cvg/platform'
import {
  PostgresControlledPublishedKernelStore,
  TenantScopedPostgresRuntimeRepository
} from '@cvg/persistence'
import { gatewayCore } from '../../../../../packages/platform/src/plugin-execution-core.ts'
import { observeFunctionCalls } from './pare217-function-call-probe.ts'
import { createPostgresControlledWorker } from '../../postgres-controlled.ts'
import { assertPublishedPostgresWorkerPreflight } from '../../postgres-role-preflight.ts'

interface ProcessFixture {
  env: Record<string, string>
  config: AgentConfig
  eventId: string
  stopAt?: 'BEFORE_COMPLETION' | 'AFTER_COMPLETION_COMMIT' | 'AFTER_S1_COMMIT'
}

async function main(): Promise<void> {
  const fixture = JSON.parse(
    await readFile(process.argv[2] ?? '', 'utf8')
  ) as ProcessFixture
  const url = new URL(fixture.env.DATABASE_URL ?? '')
  if (
    process.versions.node.split('.')[0] !== '22' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/pare217_synthetic' ||
    !/^pare217_b_worker_[a-z0-9_]+$/.test(url.username) ||
    !/^pare217_worker_b_[a-z0-9_]+$/.test(fixture.env.POSTGRES_SCHEMA ?? '') ||
    fixture.env.NODE_ENV !== 'test' ||
    fixture.env.CVG_WORKER_PUBLISHED_DURABILITY !== 'postgres-v1'
  ) {
    throw new Error('Refusing an unassigned synthetic worker process profile')
  }
  const worker = createPostgresControlledWorker(fixture.env)
  const events: Record<string, unknown>[] = []
  const gateway = createControlledCapabilityGateway()
  const resolved = gatewayCore(gateway)?.resolve(
    fixture.config,
    'find_available_slots'
  )
  if (!resolved) throw new Error('Attested synthetic observer target missing')
  let probe: Awaited<ReturnType<typeof observeFunctionCalls>> | undefined
  const notify = (point: string, extra: Record<string, unknown> = {}) => {
    process.stdout.write(
      `${JSON.stringify({
        point,
        pid: process.pid,
        workerId: worker.workerId,
        at: new Date().toISOString(),
        counts: probe?.counts ?? null,
        ...extra
      })}\n`
    )
  }
  const prototype = TenantScopedPostgresRuntimeRepository.prototype
  const original = prototype.completeInboundRuntime
  let completionCalls = 0
  prototype.completeInboundRuntime = async function (...args) {
    completionCalls++
    const input = args[0]
    notify('COMPLETION_ENTER', { completionCalls, input })
    if (fixture.stopAt === 'BEFORE_COMPLETION') {
      notify('BEFORE_COMPLETION', { completionCalls, input, queries: events })
      await new Promise<never>(() => {})
    }
    const result = await Reflect.apply(original, this, args)
    notify('COMPLETION_COMMITTED', { completionCalls, input, result })
    if (fixture.stopAt === 'AFTER_COMPLETION_COMMIT') {
      notify('AFTER_COMPLETION_COMMIT', {
        completionCalls,
        input,
        result,
        queries: events
      })
      await new Promise<never>(() => {})
    }
    return result
  }
  const storePrototype = PostgresControlledPublishedKernelStore.prototype
  const saveResumePoint = Reflect.get(storePrototype, 'saveResumePoint')
  if (typeof saveResumePoint !== 'function')
    throw new Error('Actual resume seal observer target missing')
  if (fixture.stopAt === 'AFTER_S1_COMMIT') {
    // Test barrier only: the real store transaction has returned after COMMIT.
    // Preserve its inputs/result; no checkpoint, host port or kernel is replaced.
    Reflect.set(
      storePrototype,
      'saveResumePoint',
      async function (
        this: PostgresControlledPublishedKernelStore,
        ...args: unknown[]
      ) {
        const result: unknown = await Reflect.apply(saveResumePoint, this, args)
        if ((args[1] as { safePoint?: string }).safePoint === 'S1') {
          notify('AFTER_S1_COMMIT', { seal: result, queries: events })
          await new Promise<never>(() => {})
        }
        return result
      }
    )
  }
  // Read-only SQL observation; the returned query promise and SQL remain original.
  worker.pool.on('connect', (client) => {
    const query = client.query
    client.query = function (...args: unknown[]) {
      const event: Record<string, unknown> = {
        backendPid: Reflect.get(client, 'processID'),
        sql:
          typeof args[0] === 'string'
            ? args[0]
            : Reflect.get(args[0] as object, 'text'),
        values: Array.isArray(args[1]) ? args[1] : [],
        at: new Date().toISOString()
      }
      events.push(event)
      const result: unknown = Reflect.apply(query, client, args)
      if (result instanceof Promise)
        void result.then(
          () => {
            event.finishedAt = new Date().toISOString()
          },
          (error: unknown) => {
            event.error = error instanceof Error ? error.message : String(error)
          }
        )
      return result
    } as typeof client.query
  })
  try {
    await assertPublishedPostgresWorkerPreflight({
      ...worker,
      claimExecutions: worker.claimExecutions!
    })
    probe = await observeFunctionCalls(
      {
        model: DeterministicModelProvider.prototype.complete,
        plan: CapabilityGateway.prototype.planTools,
        inputParse: resolved.inputValidator.safeParse,
        body: resolved.handler
      },
      { inputParse: { callerName: 'parseToolInput' } }
    )
    notify('BOOT', { node: process.version, stopAt: fixture.stopAt ?? null })
    const result = await worker.worker.processNext(fixture.eventId)
    notify('RESULT', { result, completionCalls, queries: events })
    if (result?.status !== 'processed')
      throw new Error('Actual native worker did not process its event')
  } finally {
    prototype.completeInboundRuntime = original
    Reflect.set(storePrototype, 'saveResumePoint', saveResumePoint)
    await probe?.stop()
    await worker.claimExecutions?.stopAndDrain()
    await worker.pool.end()
  }
}

void main().catch((error) => {
  console.error('PARE217_B_WORKER_PROCESS_ERROR', error)
  process.exitCode = 1
})
