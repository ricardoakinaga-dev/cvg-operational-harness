import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool, type QueryResultRow } from 'pg'
import {
  createControlledCapabilityGateway,
  DeterministicModelProvider,
  type ControlledPublishedSnapshot,
  type TestRunTrace
} from '@cvg/platform'
import {
  PostgresControlledPublishedKernelStore,
  TenantScopedPostgresControlPlaneRepository,
  TenantScopedPostgresRuntimeRepository,
  type FencedOuterClaimRef,
  type FencedClaimedEvent,
  type PostgresPoolLike
} from '@cvg/persistence'
import { executePublishedAgent } from '@cvg/agent-core'
import { gatewayCore } from '../../../../../packages/platform/src/plugin-execution-core.ts'
import { ClaimExecutionRegistry } from '../../claimed-execution-lifecycle.ts'
import { observeFunctionCalls } from './pare217-function-call-probe.ts'

interface ProcessFixture {
  connectionString: string
  schema: string
  tenantId: string
  executionId: string
  inboundMessageId: string
  eventId: string
  outer?: FencedOuterClaimRef
  stopAt?:
    | 'S1'
    | 'S2'
    | 'CLOSED'
    | 'INTENT'
    | 'ACKED'
    | 'P0'
    | 'ROLLBACK'
    | 'SEAL_ROLLBACK'
  observe?: boolean
  rejectPlan?: boolean
}
async function main(): Promise<void> {
  const fixture = JSON.parse(
    await readFile(process.argv[2] ?? '', 'utf8')
  ) as ProcessFixture
  const url = new URL(fixture.connectionString)
  if (
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/pare217_synthetic' ||
    !/^pare217_lead_[a-z0-9_]+$/.test(fixture.schema)
  )
    throw new Error('Refusing an unassigned synthetic process resource')
  const pool = new Pool({
    connectionString: fixture.connectionString,
    max: 4,
    connectionTimeoutMillis: 1000,
    options: `-c search_path=${fixture.schema}`
  })
  let metadataUnavailable = false
  const authorityPool: PostgresPoolLike = {
    async connect() {
      const client = await pool.connect()
      let rollbackTarget = false
      return {
        release(error?: Error) {
          client.release(error)
        },
        async query<Row extends QueryResultRow = QueryResultRow>(
          text: string,
          values?: unknown[]
        ) {
          if (
            fixture.stopAt === 'ROLLBACK' &&
            text.includes('open_phase_type=$5') &&
            values?.[4] === 'completion.evaluate'
          )
            rollbackTarget = true
          if (
            fixture.stopAt === 'SEAL_ROLLBACK' &&
            text.includes('state_revision=state_revision+1')
          )
            rollbackTarget = true
          if (rollbackTarget && text.trim() === 'COMMIT') {
            await client.query('ROLLBACK')
            metadataUnavailable = true
            notify(fixture.stopAt!)
            throw new Error(
              'Synthetic transaction rolled back before intent/seal commit'
            )
          }
          return client.query<Row>(text, values)
        }
      }
    }
  }
  const repository = new TenantScopedPostgresRuntimeRepository(authorityPool)
  const platform = new TenantScopedPostgresControlPlaneRepository(authorityPool)
  const store = new PostgresControlledPublishedKernelStore(authorityPool)
  const admission = await store.readAdmission(
    fixture.tenantId,
    fixture.inboundMessageId
  )
  if (!admission) throw new Error('Synthetic admission missing')
  const workerId =
    fixture.outer?.processWorkerId ?? `pare217-child:${randomUUID()}`
  let claimed: FencedClaimedEvent
  if (fixture.outer) {
    const event = await repository.findOutboxById(
      fixture.outer.tenantId,
      fixture.outer.eventId
    )
    if (!event) throw new Error('Synthetic outbox missing')
    claimed = {
      event,
      claimRef: fixture.outer,
      dbClaimedAt: new Date().toISOString()
    }
  } else {
    const c = await repository.claimNextFenced({
      tenantId: admission.input.tenantId,
      workerId,
      eventId: fixture.eventId
    })
    if (!c) throw new Error('Synthetic outbox unavailable')
    claimed = c
  }
  const registry = new ClaimExecutionRegistry({
    tenantId: claimed.claimRef.tenantId,
    workerId,
    adapter: repository,
    renewPaired: (outer, inner, control) =>
      store.renewPaired(outer, inner, control),
    buildEffect: () => async () => {
      throw new Error('Process seam must not dispatch a second effect')
    }
  })
  const slot = registry.reserveClaimSlot()
  if (!slot) throw new Error('Synthetic slot missing')
  const handle = registry.bindClaim(slot, claimed)
  const gateway = createControlledCapabilityGateway()
  if (fixture.rejectPlan)
    gateway.planTools = () => [
      {
        plugin: 'scheduling.controlled',
        version: '1.0.0',
        toolName: 'unsupported_synthetic_tool'
      }
    ]
  let probe: Awaited<ReturnType<typeof observeFunctionCalls>> | undefined
  // A test controller may release a paused point; SIGKILL cases never send data.
  const waitForever = () =>
    new Promise<void>((finish) =>
      process.stdin.once('data', () => {
        process.stdin.pause()
        finish()
      })
    )
  const notify = (point: string, snapshot?: ControlledPublishedSnapshot) =>
    process.stdout.write(
      JSON.stringify({
        point,
        pid: process.pid,
        workerId,
        counts: probe?.counts ?? null,
        safePoint: snapshot?.safePoint
      }) + '\n'
    )
  try {
    await handle.startOuter()
    const claim = await store.claim(fixture.executionId, claimed.claimRef)
    const version = await platform.getVersion(
      { tenantId: admission.input.tenantId },
      admission.input.versionId
    )
    if (!version) throw new Error('Pinned synthetic version missing')
    const resolved = gatewayCore(gateway)?.resolve(
      version.config,
      'find_available_slots'
    )
    if (fixture.observe) {
      if (!resolved) throw new Error('Attested synthetic probe target missing')
      probe = await observeFunctionCalls(
        {
          model: DeterministicModelProvider.prototype.complete,
          plan: gateway.planTools,
          inputParse: resolved.inputValidator.safeParse,
          body: resolved.handler
        },
        {
          inputParse: {
            scopeVariable: 'inst',
            identity: resolved.inputValidator
          }
        }
      )
    }
    let trace: TestRunTrace
    if (claim.disposition === 'CLOSED') {
      if (!claim.state.closedTrace) throw new Error('Closed trace missing')
      trace = claim.state.closedTrace
      notify('CLOSED_REPLAY')
      handle.requestStop('finalizing')
      await handle.stopAndJoin()
    } else {
      if (claim.disposition === 'ACTIVE') await handle.attachInner(claim.fence)
      const host = store.createHost(claim, handle, handle.signal)
      const save = host.continuation.saveResumePoint
      host.continuation.saveResumePoint = async (...args) => {
        const result = await save(...args)
        if (fixture.stopAt === args[1].safePoint) {
          notify(args[1].safePoint, args[1])
          await waitForever()
        }
        return result
      }
      const begin = host.continuation.beginPhase
      host.continuation.beginPhase = async (...args) => {
        if (fixture.stopAt === 'P0' && args[2] === 'completion.evaluate') {
          metadataUnavailable = true
          notify('P0')
          throw new Error('Synthetic intent not sent; metadata unavailable')
        }
        if (metadataUnavailable)
          throw new Error('Synthetic metadata unavailable before intent')
        const result = await begin(...args)
        if (fixture.stopAt === 'INTENT' && args[2] === 'completion.evaluate') {
          notify('INTENT')
          await waitForever()
        }
        return result
      }
      const ack = host.continuation.ackPhase
      host.continuation.ackPhase = async (...args) => {
        const result = await ack(...args)
        if (
          fixture.stopAt === 'ACKED' &&
          args[1].phaseType === 'completion.evaluate'
        ) {
          notify('ACKED')
          await waitForever()
        }
        return result
      }
      const close = host.continuation.close
      const poison = host.continuation.poison
      host.continuation.poison = async (...args) => {
        if (metadataUnavailable) throw new Error('Synthetic poison unavailable')
        return poison(...args)
      }
      host.continuation.close = async (...args) => {
        if (metadataUnavailable) throw new Error('Synthetic close unavailable')
        await close(...args)
        if (fixture.stopAt === 'CLOSED') {
          notify('CLOSED')
          await waitForever()
        }
      }
      const result = await executePublishedAgent(
        {
          store: platform,
          tenantId: admission.input.tenantId,
          agentId: admission.input.agentId,
          versionId: admission.input.versionId,
          traceId: admission.input.traceId,
          message: admission.input.message,
          history: admission.input.history,
          context: admission.input.context,
          capabilityGateway: gateway,
          ...(admission.input.requireCapabilityApproval
            ? { requireCapabilityApproval: true }
            : {}),
          actor: {
            id: 'system.controlled-runtime',
            role: 'System',
            permissions: ['scheduling:read']
          },
          onToolAudit: (event) => store.appendToolAudit(claim, event)
        },
        host
      )
      if (result.status !== 'completed')
        throw new Error('Synthetic facade not configured')
      trace = result.trace
    }
    notify('RESULT')
    process.stdout.write(
      JSON.stringify({ point: 'TRACE', pid: process.pid, trace }) + '\n'
    )
  } catch (error) {
    notify('ERROR_RESULT')
    console.error('PARE217_PROCESS_ERROR', error)
    process.exitCode = 1
  } finally {
    await probe?.stop().catch((error) => {
      console.error('PARE217_PROBE_CLEANUP_ERROR', error)
      process.exitCode = 1
    })
    await handle.stopAndJoin().catch((error) => {
      console.error('PARE217_PROCESS_JOIN_ERROR', error)
      process.exitCode = 1
    })
    registry.releaseClaimSlot(slot)
    await pool.end()
  }
}
void main().catch((error) => {
  console.error('PARE217_PROCESS_BOOT_ERROR', error)
  process.exitCode = 1
})
