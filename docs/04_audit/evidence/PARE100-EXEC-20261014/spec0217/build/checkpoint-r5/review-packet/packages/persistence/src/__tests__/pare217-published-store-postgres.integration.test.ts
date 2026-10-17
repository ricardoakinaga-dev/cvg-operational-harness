import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { resolve } from 'node:path'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AgentConfigSchema,
  InMemoryControlPlaneStore,
  createControlledCapabilityGateway,
  createTraceId,
  prepareControlledPublishedAdmission,
  executeConfiguredAgent,
  createCapabilityInputHash,
  controlledCanonicalJson,
  controlledDigest,
  type ControlledPublishedAdmission,
  type ControlledKernelHostContext,
  type ControlledPhaseRef,
  type ControlledPublishedPrepared
} from '@cvg/platform'
import { sealCheckpoint, validateCheckpointIntegrity } from '@cvg/harness'
import { createCorrelationId } from '@cvg/shared'
import { PostgresControlledPublishedKernelStore } from '../controlled-published-kernel-store.ts'
import {
  PostgresOperationalExecutionStore,
  PostgresOperationalEffectJournal
} from '../operational-execution-postgres.ts'
import { PostgresExecutionStepStore } from '../operational-step-postgres.ts'
import { TenantScopedPostgresCapabilityApprovalRepository } from '../tenant-scoped-capability-approval-repository.ts'
import { runPostgresMigrations } from '../postgres-migrations.ts'
import {
  TenantScopedPostgresRuntimeRepository,
  withTenantContext,
  withTenantTransaction
} from '../tenant-scoped-postgres.ts'

const resourcePath = process.env.PARE217_PG_RESOURCE
if (process.env.PARE217_PG_REQUIRED === '1' && !resourcePath)
  throw new Error('Assigned PG217 resource required')
const tenantId = 'tenant_00000000-0000-4000-8000-000000000217'
const otherTenant = 'tenant_00000000-0000-4000-8000-000000000218'
const schema = `pare217_lead_${Date.now()}_${randomBytes(3).toString('hex')}`
const role = `pare217_lead_role_${Date.now()}_${randomBytes(3).toString('hex')}`
let admin: Client,
  pool: Pool,
  repository: TenantScopedPostgresRuntimeRepository,
  store: PostgresControlledPublishedKernelStore
let schemaCreated = false,
  roleCreated = false
let servingUrl: string

describe.skipIf(!resourcePath)(
  'SPEC0217 real PostgreSQL published store (assigned synthetic resource)',
  () => {
    beforeAll(async () => {
      const resource = JSON.parse(await readFile(resourcePath!, 'utf8')) as {
        test_database_url: string
      }
      const url = new URL(resource.test_database_url)
      if (
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/pare217_synthetic' ||
        url.username !== 'pare217'
      )
        throw new Error('Refusing an unassigned database')
      admin = new Client({ connectionString: url.toString() })
      await admin.connect()
      await admin.query(`CREATE SCHEMA ${schema}`)
      schemaCreated = true
      await runPostgresMigrations(admin, {
        schemaName: schema,
        createSchema: false
      })
      const password = randomBytes(24).toString('hex')
      await admin.query(
        `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
      )
      roleCreated = true
      await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
      await admin.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`
      )
      await admin.query(
        `REVOKE DELETE ON ${schema}.controlled_published_bindings FROM ${role}`
      )
      await admin.query(
        `REVOKE UPDATE,DELETE ON ${schema}.controlled_published_evidence FROM ${role}`
      )
      await admin.query(
        `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`
      )
      url.username = role
      url.password = password
      servingUrl = url.toString()
      pool = new Pool({
        connectionString: url.toString(),
        max: 4,
        connectionTimeoutMillis: 1000,
        options: `-c search_path=${schema} -c lock_timeout=1500 -c statement_timeout=3000`
      })
      repository = new TenantScopedPostgresRuntimeRepository(pool)
      store = new PostgresControlledPublishedKernelStore(pool)
      console.info(
        'PARE217_LEAD_PG',
        JSON.stringify({ schema, role, pid: process.pid })
      )
    }, 30000)
    afterAll(async () => {
      await pool?.end()
      if (schemaCreated) await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      if (roleCreated) await admin.query(`DROP ROLE ${role}`)
      await admin?.end()
    }, 30000)

    async function fixture(
      plugins = false,
      requireCapabilityApproval = false,
      timeoutMs = 60000,
      message = 'Quero uma consulta'
    ) {
      const config = AgentConfigSchema.parse({
        persona: { name: 'Synthetic217', role: 'assistant', tone: 'calm' },
        greeting: 'Resposta controlada.',
        promptBlocks: [],
        responseTemplates: {},
        model: {
          provider: 'fake',
          model: 'deterministic-v1',
          temperature: 0,
          maxTokens: 128,
          timeoutMs,
          retries: 0,
          secretRef: 'secret://controlled/synthetic'
        },
        policies: {
          version: 'synthetic217',
          minConfidence: 0.7,
          lowConfidence: 'clarify',
          maxClarifications: 2,
          enabledActions: ['respond', 'scheduling'],
          approvalActions: [],
          blockedActions: []
        },
        plugins: plugins
          ? [
              {
                plugin: 'scheduling.controlled',
                version: '1.0.0',
                enabled: true,
                allowedTools: ['find_available_slots'],
                config: {}
              }
            ]
          : [],
        knowledge: [],
        handoff: {
          lowConfidenceDestination: 'synthetic',
          destinations: ['synthetic'],
          maxClarifications: 2
        }
      })
      const platform = new InMemoryControlPlaneStore()
      const agent = await platform.createAgent(
        { tenantId },
        {
          slug: `synthetic-${randomUUID()}`,
          name: 'Synthetic',
          description: 'Synthetic only'
        }
      )
      const version = await platform.createVersion(
        { tenantId },
        agent.id,
        config,
        'synthetic'
      )
      await withTenantTransaction(pool, tenantId, async (client) => {
        await client.query(
          `INSERT INTO platform_agents(tenant_id,id,slug,name,description) VALUES($1,$2,$3,'Synthetic','Synthetic only')`,
          [tenantId, agent.id, agent.slug]
        )
        await client.query(
          `INSERT INTO platform_agent_versions(tenant_id,id,agent_id,version,status,config,created_by) VALUES($1,$2,$3,1,'PUBLISHED',$4::jsonb,'synthetic')`,
          [tenantId, version.id, agent.id, JSON.stringify(config)]
        )
      })
      const inbound = await repository.createWithSession({
        tenantId,
        channel: 'web',
        senderRef: `synthetic-${randomUUID()}`,
        externalMessageId: randomUUID(),
        body: message
      })
      const event = await repository.enqueue({
        tenantId,
        type: 'inbound.process',
        idempotencyKey: `synthetic217:${randomUUID()}`,
        payload: { fixture: true },
        conversationId: inbound.conversation.id,
        sessionId: inbound.session.id,
        inboundMessageId: inbound.message.id
      })
      const workerId = `synthetic217:${randomUUID()}`
      const claimed = await repository.claimNextFenced({
        tenantId,
        workerId,
        eventId: event.id
      })
      if (!claimed) throw new Error('Own synthetic outbox not claimed')
      const input = {
        tenantId,
        agentId: agent.id,
        versionId: version.id,
        traceId: createTraceId(),
        executionId: `exec_${randomUUID()}`,
        correlationId: createCorrelationId(),
        inboundMessageId: inbound.message.id,
        message,
        history: [],
        executionMode: 'CONTROLLED_RUNTIME' as const,
        requireCapabilityApproval,
        context: {
          conversationId: inbound.conversation.id,
          sessionId: inbound.session.id
        }
      }
      const actor = {
        id: 'system.controlled-runtime',
        role: 'System',
        permissions: ['scheduling:read']
      }
      const authority = new TenantScopedPostgresCapabilityApprovalRepository(
        pool
      )
      const gateway = createControlledCapabilityGateway({
        approvalAuthority: authority
      })
      const admission = prepareControlledPublishedAdmission({
        version,
        input,
        actor,
        gateway
      })
      return {
        admission,
        claimed,
        platform,
        actor,
        gateway,
        input,
        authority,
        version
      }
    }
    const lifecycle = (): ControlledKernelHostContext['lifecycle'] => ({
      assertActive() {},
      requestStop() {},
      async stopAndJoin() {}
    })

    async function childProcess(
      f: Awaited<ReturnType<typeof fixture>>,
      label: string,
      stopAt?: string,
      first = false
    ) {
      const directory = resolve(
        process.env.PARE217_PROCESS_EVIDENCE ??
          `/tmp/cvg-pare217-process-${process.pid}-${randomUUID()}`,
        label
      )
      await mkdir(directory, { recursive: true })
      const path = resolve(directory, 'synthetic-process-config.json')
      await writeFile(
        path,
        JSON.stringify({
          connectionString: servingUrl,
          schema,
          tenantId,
          executionId: f.input.executionId,
          inboundMessageId: f.input.inboundMessageId,
          eventId: f.claimed.event.id,
          observe: true,
          ...(stopAt ? { stopAt } : {}),
          ...(first ? { outer: f.claimed.claimRef } : {})
        }),
        { mode: 0o600 }
      )
      const executable = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
      const args = [
        '--import',
        'tsx',
        'apps/worker/src/__tests__/fixtures/pare217-platform-process.ts',
        path
      ]
      const child: ChildProcessWithoutNullStreams = spawn(executable, args, {
        cwd: process.cwd(),
        stdio: 'pipe',
        env: {
          PATH: '/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin',
          HOME: directory,
          TMPDIR: directory,
          XDG_CONFIG_HOME: resolve(directory, 'config'),
          XDG_DATA_HOME: resolve(directory, 'data'),
          LANG: 'C.UTF-8'
        }
      })
      let stdout = '',
        stderr = ''
      const messages: Record<string, unknown>[] = []
      const listeners = new Set<() => void>()
      child.stdout.on('data', (data) => {
        stdout += String(data)
        if (Buffer.byteLength(stdout) > 1048576) child.kill('SIGKILL')
        for (const line of String(data).split('\n')) {
          try {
            const msg = JSON.parse(line) as Record<string, unknown>
            if (msg.point) messages.push(msg)
          } catch {
            /* Partial lines handled by the accumulated buffer below. */
          }
        }
        for (const line of stdout.split('\n')) {
          try {
            const msg = JSON.parse(line) as Record<string, unknown>
            if (msg.point && !messages.some((m) => m.point === msg.point))
              messages.push(msg)
          } catch {
            /* Diagnostic lines are preserved raw. */
          }
        }
        for (const listener of listeners) listener()
      })
      child.stderr.on('data', (data) => {
        stderr += String(data)
        if (Buffer.byteLength(stderr) > 1048576) child.kill('SIGKILL')
      })
      const exited = new Promise<{
        code: number | null
        signal: NodeJS.Signals | null
      }>((finish, reject) => {
        child.once('error', reject)
        child.once('exit', (code, signal) => finish({ code, signal }))
      })
      const awaitPoint = (point: string) =>
        new Promise<Record<string, unknown>>((finish, reject) => {
          const timeout = setTimeout(() => {
            listeners.delete(check)
            reject(
              new Error(
                `Synthetic process readiness ${point} timed out: ${stderr}`
              )
            )
          }, 5000)
          const check = () => {
            const found = messages.find((m) => m.point === point)
            if (found) {
              clearTimeout(timeout)
              listeners.delete(check)
              finish(found)
            }
          }
          listeners.add(check)
          check()
        })
      let recorded:
        | Promise<{
            code: number | null
            signal: NodeJS.Signals | null
          }>
        | undefined
      const recordOnce = async () => {
        const exit = await exited
        await unlink(path)
        await writeFile(resolve(directory, 'stdout.log'), stdout)
        await writeFile(resolve(directory, 'stderr.log'), stderr)
        await writeFile(
          resolve(directory, 'process.json'),
          JSON.stringify(
            {
              executable,
              args: [...args.slice(0, -1), 'synthetic-process-config.json'],
              pid: child.pid,
              exit,
              messages
            },
            null,
            2
          ) + '\n'
        )
        console.info(
          'PARE217_REAL_PROCESS',
          JSON.stringify({
            label,
            pid: child.pid,
            exit,
            directory,
            messages: messages.map(({ trace, ...metadata }) => {
              void trace
              return metadata
            })
          })
        )
        return exit
      }
      return {
        child,
        exited,
        awaitPoint,
        record() {
          recorded ??= recordOnce()
          return recorded
        }
      }
    }

    async function recoveredS1(
      f: Awaited<ReturnType<typeof fixture>>,
      label: string
    ) {
      await store.admit(f.admission, f.claimed.claimRef)
      const child = await childProcess(f, label, 'S1', true)
      try {
        await child.awaitPoint('S1')
      } finally {
        child.child.kill('SIGKILL')
        await child.record()
      }
      const clock = (
        await withTenantContext(pool, tenantId, (c) =>
          c.query(
            `SELECT clock_timestamp() AS now,e.lease_until,o.lease_until AS outer_until FROM operational_executions e
        JOIN outbox_events o ON o.tenant_id=e.tenant_id WHERE e.tenant_id=$1 AND e.id=$2 AND o.id=$3`,
            [tenantId, f.input.executionId, f.claimed.event.id]
          )
        )
      ).rows[0]!
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(clock.lease_until.getTime(), clock.outer_until.getTime()) -
            clock.now.getTime() +
            150
        )
      )
      const outer = await repository.claimNextFenced({
        tenantId,
        eventId: f.claimed.event.id,
        workerId: `synthetic217-recovered:${randomUUID()}`
      })
      if (!outer) throw new Error('Own synthetic outbox did not recover')
      const claim = await store.claim(f.input.executionId, outer.claimRef)
      expect(claim.disposition).toBe('ACTIVE')
      expect(claim.state.snapshot?.safePoint).toBe('S1')
      return claim
    }

    it('migrates additive sidecars and serves with FORCE RLS through a non-owner non-superuser', async () => {
      const roles = await pool.query(
        'SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'
      )
      expect(roles.rows[0]!).toEqual({ rolsuper: false, rolbypassrls: false })
      const f = await fixture()
      const admitted = await store.admit(f.admission, f.claimed.claimRef)
      expect(admitted.executionId).toBe(f.input.executionId)
      expect(
        await store.readAdmission(otherTenant, f.input.inboundMessageId)
      ).toBeNull()
      expect(
        (await pool.query('SELECT * FROM controlled_published_bindings')).rows
      ).toHaveLength(0)
      const rls = await admin.query(
        'SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname=ANY($2)',
        [
          schema,
          ['controlled_published_bindings', 'controlled_published_evidence']
        ]
      )
      expect(rls.rows).toHaveLength(2)
      for (const row of rls.rows)
        expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true })
    })
    it('admits the same digest once and rejects a divergent request without a second parent', async () => {
      const f = await fixture()
      const first = await store.admit(f.admission, f.claimed.claimRef)
      expect(await store.admit(f.admission, f.claimed.claimRef)).toEqual(first)
      const changed: ControlledPublishedAdmission = {
        ...f.admission,
        requestDigest: `sha256-${'f'.repeat(64)}`
      }
      await expect(
        store.admit(changed, f.claimed.claimRef)
      ).rejects.toMatchObject({ code: 'conflict' })
      expect(
        (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              'SELECT id FROM operational_executions WHERE tenant_id=$1 AND id=$2',
              [tenantId, first.executionId]
            )
          )
        ).rowCount
      ).toBe(1)
    })
    it('excludes bound work from generic claim/recovery and rejects generic heartbeat/transition', async () => {
      const f = await fixture()
      await store.admit(f.admission, f.claimed.claimRef)
      const generic = new PostgresOperationalExecutionStore(pool)
      expect(await generic.claimNext(tenantId, 'generic')).toBeNull()
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef)
      await expect(
        generic.heartbeat(
          tenantId,
          claim.executionId,
          claim.fence.workerId,
          claim.fence.attempt
        )
      ).rejects.toMatchObject({ code: 'lease_lost' })
      await expect(
        generic.transition({
          tenantId,
          executionId: claim.executionId,
          workerId: claim.fence.workerId,
          fenceToken: claim.fence.attempt,
          to: 'RUNNING'
        })
      ).rejects.toMatchObject({ code: 'lease_lost' })
    })
    it('commits phase intent and ACK without creating a resume seal, and forbids old SQL writers', async () => {
      const f = await fixture()
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef)
      const host = store.createHost(
        claim,
        lifecycle(),
        new AbortController().signal
      )
      const phase = await host.continuation.beginPhase(
        host.identity,
        host.state.sealId,
        'model.request',
        `sha256-${'a'.repeat(64)}`
      )
      const ack = await host.continuation.ackPhase(host.identity, phase, {
        phaseType: 'model.request',
        completed: true
      })
      expect(ack.sequence).toBe(2)
      await expect(
        withTenantTransaction(pool, tenantId, (c) =>
          c.query(
            'UPDATE operational_executions SET updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',
            [tenantId, claim.executionId]
          )
        )
      ).rejects.toMatchObject({ code: '42501' })
      await expect(
        withTenantTransaction(pool, tenantId, (c) =>
          c.query(
            `UPDATE operational_executions SET request=jsonb_set(request,
              '{runtime,context,values,adapterVersion}', '"unbound"'::jsonb)
             WHERE tenant_id=$1 AND id=$2`,
            [tenantId, claim.executionId]
          )
        )
      ).rejects.toMatchObject({ code: '42501' })
      await expect(
        withTenantTransaction(pool, tenantId, (c) =>
          c.query(
            'DELETE FROM operational_executions WHERE tenant_id=$1 AND id=$2',
            [tenantId, claim.executionId]
          )
        )
      ).rejects.toMatchObject({ code: '42501' })
      const rows = await withTenantContext(pool, tenantId, (c) =>
        c.query(
          'SELECT phase_state,open_phase_acked,seal_id FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
          [tenantId, claim.executionId]
        )
      )
      expect(rows.rows[0]!).toEqual({
        phase_state: 'OPEN',
        open_phase_acked: true,
        seal_id: host.state.sealId
      })
    })
    it('runs the public controlled facade on the actual PG ports and closes a private trace atomically', async () => {
      const f = await fixture()
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef)
      const host = store.createHost(
        claim,
        lifecycle(),
        new AbortController().signal
      )
      host.continuation = new Proxy(host.continuation, {
        get(target, key, receiver) {
          const value: unknown = Reflect.get(target, key, receiver)
          if (typeof value !== 'function') return value
          return async (...args: unknown[]) => {
            try {
              return await Reflect.apply(value, target, args)
            } catch (error) {
              console.info('PARE217_CONTINUATION_REJECT', String(key), error)
              if (key === 'close')
                console.info(
                  'PARE217_CLOSE_FACTS',
                  (
                    await withTenantContext(pool, tenantId, (c) =>
                      c.query(
                        'SELECT event_type FROM controlled_published_evidence WHERE tenant_id=$1 AND execution_id=$2 ORDER BY sequence',
                        [tenantId, claim.executionId]
                      )
                    )
                  ).rows
                )
              throw error
            }
          }
        }
      })
      const trace = await executeConfiguredAgent(
        {
          store: f.platform,
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          message: f.input.message,
          history: [],
          executionMode: 'CONTROLLED_RUNTIME',
          actor: f.actor,
          capabilityGateway: f.gateway,
          context: f.input.context,
          onToolAudit: (event) => store.appendToolAudit(claim, event)
        },
        host
      )
      const rows = await withTenantContext(pool, tenantId, (c) =>
        c.query(
          `SELECT b.phase_state,b.closed_trace,e.state,e.result FROM controlled_published_bindings b
      JOIN operational_executions e ON e.tenant_id=b.tenant_id AND e.id=b.execution_id WHERE b.tenant_id=$1 AND b.execution_id=$2`,
          [tenantId, claim.executionId]
        )
      )
      expect(rows.rows[0]!.phase_state).toBe('CLOSED')
      expect(rows.rows[0]!.closed_trace).toEqual(
        JSON.parse(JSON.stringify(trace))
      )
      expect(rows.rows[0]!.state).toBe('SUCCEEDED')
      expect(rows.rows[0]!.result.stopReason).toBe('COMPLETED')
      expect(
        (
          await new PostgresExecutionStepStore(pool).loadCheckpoint(
            tenantId,
            claim.executionId
          )
        )?.stepNumber
      ).toBeGreaterThan(0)
    })
    it('persists one attested synthetic tool, CONFIRMED journal and one atomic callback mirror before success', async () => {
      const f = await fixture(true)
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef)
      const host = store.createHost(
        claim,
        lifecycle(),
        new AbortController().signal
      )
      const trace = await executeConfiguredAgent(
        {
          store: f.platform,
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          message: f.input.message,
          history: [],
          executionMode: 'CONTROLLED_RUNTIME',
          actor: f.actor,
          capabilityGateway: f.gateway,
          context: f.input.context,
          onToolAudit: (event) => store.appendToolAudit(claim, event)
        },
        host
      )
      expect(trace.tools).toEqual([
        { name: 'find_available_slots', status: 'succeeded' }
      ])
      const journal = await withTenantContext(pool, tenantId, (c) =>
        c.query(
          'SELECT state FROM operational_effect_journal WHERE tenant_id=$1 AND operation_key=$2',
          [tenantId, `${claim.executionId}:s2:find_available_slots`]
        )
      )
      expect(journal.rows).toEqual([{ state: 'CONFIRMED' }])
      const callback = await withTenantContext(pool, tenantId, (c) =>
        c.query(
          `SELECT canonical_payload FROM controlled_published_evidence
      WHERE tenant_id=$1 AND execution_id=$2 AND event_type='callback.tool'`,
          [tenantId, claim.executionId]
        )
      )
      expect(callback.rows).toHaveLength(1)
      const mirrorId = callback.rows[0]!.canonical_payload.mirrorAuditId
      expect(typeof mirrorId).toBe('string')
      expect(
        (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              'SELECT id FROM audit_events WHERE tenant_id=$1 AND id=$2',
              [tenantId, mirrorId]
            )
          )
        ).rowCount
      ).toBe(1)
      const replay = await store.claim(claim.executionId, f.claimed.claimRef)
      expect(replay.disposition).toBe('CLOSED')
      expect(replay.state.closedTrace).toEqual(trace)
      expect(replay.state.runtimeResult?.stopReason).toBe('COMPLETED')
    })
    it('consumes existing0002 once with audit, attempt receipt and phase ACK in the same transaction', async () => {
      const f = await fixture(true, true)
      const approval = await f.authority.issue({
        tenantId,
        agentId: f.input.agentId,
        versionId: f.input.versionId,
        toolName: 'find_available_slots',
        input: { message: f.input.message },
        actorId: f.actor.id,
        issuer: 'human.synthetic',
        expiresAt: new Date(Date.now() + 60000)
      })
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef)
      const host = store.createHost(
        claim,
        lifecycle(),
        new AbortController().signal
      )
      const trace = await executeConfiguredAgent(
        {
          store: f.platform,
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          message: f.input.message,
          history: [],
          executionMode: 'CONTROLLED_RUNTIME',
          actor: f.actor,
          requireCapabilityApproval: true,
          capabilityApproval: {
            id: approval.id,
            tenantId,
            agentId: f.input.agentId,
            versionId: f.input.versionId,
            toolName: 'find_available_slots',
            actorId: f.actor.id,
            expiresAt: approval.expiresAt
          },
          capabilityGateway: f.gateway,
          context: f.input.context,
          onToolAudit: (event) => store.appendToolAudit(claim, event)
        },
        host
      )
      expect(trace.tools).toEqual([
        { name: 'find_available_slots', status: 'succeeded' }
      ])
      expect((await f.authority.get(approval.id, tenantId))?.status).toBe(
        'consumed'
      )
      const binding = (
        await withTenantContext(pool, tenantId, (c) =>
          c.query(
            'SELECT approval_receipt,state FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
            [tenantId, claim.executionId]
          )
        )
      ).rows[0]!
      expect(binding.state.attempts[0].approvalConsumed).toBe(true)
      expect(binding.state.attempts[0].approvalReceipt).toEqual(
        binding.approval_receipt
      )
      expect(binding.approval_receipt).toMatchObject({
        approvalId: approval.id,
        executionId: claim.executionId,
        operationKey: `${claim.executionId}:s2:find_available_slots`,
        outerAttemptRowId: f.claimed.claimRef.expectedAttemptRowId
      })
      expect(
        (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              'SELECT id FROM audit_events WHERE tenant_id=$1 AND id=$2',
              [tenantId, binding.approval_receipt.consumptionAuditId]
            )
          )
        ).rowCount
      ).toBe(1)
    })
    it('a real kernel S2 cannot downgrade its bound approval requirement or omit consumed receipt proof', async () => {
      const f = await fixture(true, true)
      const approval = await f.authority.issue({
        tenantId,
        agentId: f.input.agentId,
        versionId: f.input.versionId,
        toolName: 'find_available_slots',
        input: { message: f.input.message },
        actorId: f.actor.id,
        issuer: 'human.synthetic',
        expiresAt: new Date(Date.now() + 60000)
      })
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef)
      const host = store.createHost(
        claim,
        lifecycle(),
        new AbortController().signal
      )
      const save = host.continuation.saveResumePoint
      let rejected = 0
      host.continuation.saveResumePoint = async (...args) => {
        const snapshot = args[1]
        if (snapshot.safePoint === 'S2') {
          expect(snapshot.attempts[0]).toMatchObject({
            approvalRequired: true,
            approvalConsumed: true
          })
          const before = (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                'SELECT state,state_revision,approval_receipt,phase_state FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
                [tenantId, claim.executionId]
              )
            )
          ).rows[0]!
          for (const mode of [
            'downgrade',
            'omit-receipt',
            'omit-consumed',
            'omit-settlement',
            'foreign-receipt',
            'downgrade-command'
          ] as const) {
            const bad = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot
            const a = bad.attempts[0]!
            if (mode === 'downgrade' || mode === 'downgrade-command') {
              a.approvalRequired = false
              a.approvalConsumed = false
              delete a.approvalReceipt
              a.evidenceRefs = (a.evidenceRefs ?? []).filter(
                (r) => r.phaseType !== 'approval.settlement'
              )
            }
            if (mode === 'omit-receipt') delete a.approvalReceipt
            if (mode === 'omit-consumed') a.approvalConsumed = false
            if (mode === 'omit-settlement')
              a.evidenceRefs = (a.evidenceRefs ?? []).filter(
                (r) => r.phaseType !== 'approval.settlement'
              )
            if (mode === 'foreign-receipt')
              a.approvalReceipt!.receiptId = 'receipt_foreign'
            if (mode === 'downgrade-command') {
              a.command.execution.requireApproval = false
              a.command.execution.policy = {
                ...a.command.execution.policy,
                decision: 'allowed'
              }
              bad.planDigest = controlledDigest({
                names: bad.names,
                attempts: bad.attempts.map((a) => a.command),
                outcome: bad.planOutcome
              })
            }
            await expect(
              save(args[0], bad, args[2], args[3], args[4])
            ).rejects.toThrow()
            const after = (
              await withTenantContext(pool, tenantId, (c) =>
                c.query(
                  'SELECT state,state_revision,approval_receipt,phase_state FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
                  [tenantId, claim.executionId]
                )
              )
            ).rows[0]!
            expect(after).toEqual(before)
            rejected++
          }
        }
        return save(...args)
      }
      const trace = await executeConfiguredAgent(
        {
          store: f.platform,
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          message: f.input.message,
          history: [],
          executionMode: 'CONTROLLED_RUNTIME',
          actor: f.actor,
          requireCapabilityApproval: true,
          capabilityApproval: {
            id: approval.id,
            tenantId,
            agentId: f.input.agentId,
            versionId: f.input.versionId,
            toolName: 'find_available_slots',
            actorId: f.actor.id,
            expiresAt: approval.expiresAt
          },
          capabilityGateway: f.gateway,
          context: f.input.context,
          onToolAudit: (e) => store.appendToolAudit(claim, e)
        },
        host
      )
      expect(trace.status).toBe('completed')
      expect(rejected).toBe(6)
      expect((await f.authority.get(approval.id, tenantId))?.status).toBe(
        'consumed'
      )
    })

    it('a real kernel S1 seal rejects command drift from its admitted request atomically', async () => {
      const f = await fixture(true, true)
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef)
      const host = store.createHost(
        claim,
        lifecycle(),
        new AbortController().signal
      )
      const save = host.continuation.saveResumePoint
      let rejected = 0
      host.continuation.saveResumePoint = async (...args) => {
        const snapshot = args[1]
        if (snapshot.safePoint === 'S1') {
          const readBinding = async () =>
            (
              await withTenantContext(pool, tenantId, (c) =>
                c.query(
                  'SELECT state,state_revision,approval_receipt,phase_state FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
                  [tenantId, claim.executionId]
                )
              )
            ).rows[0]!
          const before = await readBinding()
          for (const field of [
            'approval',
            'policy',
            'dry-run',
            'input'
          ] as const) {
            const bad = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot
            const command = bad.attempts[0]!.command
            if (field === 'approval') command.execution.requireApproval = false
            if (field === 'policy') command.execution.policy.reason = 'changed'
            if (field === 'dry-run') command.execution.dryRun = true
            if (field === 'input') {
              command.execution.input = { message: 'Outra mensagem sintética' }
              command.canonical = controlledCanonicalJson(
                command.execution.input
              )
              command.inputHash = createCapabilityInputHash(command.execution)
            }
            bad.planDigest = controlledDigest({
              names: bad.names,
              attempts: bad.attempts.map((a) => a.command),
              outcome: bad.planOutcome
            })
            await expect(
              save(args[0], bad, args[2], args[3], args[4])
            ).rejects.toThrow()
            expect(await readBinding()).toEqual(before)
            rejected++
          }
        }
        return save(...args)
      }
      const trace = await executeConfiguredAgent(
        {
          store: f.platform,
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          message: f.input.message,
          history: [],
          executionMode: 'CONTROLLED_RUNTIME',
          actor: f.actor,
          requireCapabilityApproval: true,
          capabilityGateway: f.gateway,
          context: f.input.context,
          onToolAudit: (e) => store.appendToolAudit(claim, e)
        },
        host
      )
      expect(rejected).toBe(4)
      expect(trace.status).toBe('blocked')
      expect(trace.tools.some((t) => t.status === 'succeeded')).toBe(false)
    })

    it('a missing one-use grant closes POLICY_DENIED without creating a neutral pending approval', async () => {
      const f = await fixture(true, true)
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef),
        host = store.createHost(
          claim,
          lifecycle(),
          new AbortController().signal
        )
      const trace = await executeConfiguredAgent(
        {
          store: f.platform,
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          message: f.input.message,
          history: [],
          executionMode: 'CONTROLLED_RUNTIME',
          actor: f.actor,
          requireCapabilityApproval: true,
          capabilityGateway: f.gateway,
          context: f.input.context,
          onToolAudit: (event) => store.appendToolAudit(claim, event)
        },
        host
      )
      expect(trace.status, JSON.stringify(trace)).toBe('blocked')
      expect(trace.response.mode).toBe('handoff')
      const row = (
        await withTenantContext(pool, tenantId, (c) =>
          c.query(
            `SELECT e.state,b.runtime_result FROM operational_executions e
        JOIN controlled_published_bindings b ON b.tenant_id=e.tenant_id AND b.execution_id=e.id WHERE e.tenant_id=$1 AND e.id=$2`,
            [tenantId, claim.executionId]
          )
        )
      ).rows[0]!
      expect(row).toMatchObject({
        state: 'FAILED_TERMINAL',
        runtime_result: { stopReason: 'POLICY_DENIED' }
      })
      expect(
        (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              'SELECT approval_id FROM runtime_approvals WHERE tenant_id=$1 AND agent_id=$2',
              [tenantId, f.input.agentId]
            )
          )
        ).rows
      ).toHaveLength(0)
    })

    it('a real receipt-write failure rolls back0002 consumption, audit, receipt and phase ACK together', async () => {
      const f = await fixture(true, true)
      const approval = await f.authority.issue({
        tenantId,
        agentId: f.input.agentId,
        versionId: f.input.versionId,
        toolName: 'find_available_slots',
        input: { message: f.input.message },
        actorId: f.actor.id,
        issuer: 'human.synthetic',
        expiresAt: new Date(Date.now() + 60000)
      })
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef),
        host = store.createHost(
          claim,
          lifecycle(),
          new AbortController().signal
        )
      const trigger = `pare217_receipt_fail_${randomBytes(4).toString('hex')}`
      await admin.query(`CREATE FUNCTION ${schema}.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.execution_id='${claim.executionId}' AND NEW.event_type='approval.consumed' THEN RAISE EXCEPTION 'synthetic receipt-write failure';END IF;RETURN NEW;END $$`)
      await admin.query(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON ${schema}.controlled_published_evidence FOR EACH ROW EXECUTE FUNCTION ${schema}.${trigger}()`
      )
      try {
        const trace = await executeConfiguredAgent(
          {
            store: f.platform,
            tenantId,
            agentId: f.input.agentId,
            versionId: f.input.versionId,
            traceId: f.input.traceId,
            message: f.input.message,
            history: [],
            executionMode: 'CONTROLLED_RUNTIME',
            actor: f.actor,
            requireCapabilityApproval: true,
            capabilityApproval: {
              id: approval.id,
              tenantId,
              agentId: f.input.agentId,
              versionId: f.input.versionId,
              toolName: 'find_available_slots',
              actorId: f.actor.id,
              expiresAt: approval.expiresAt
            },
            capabilityGateway: f.gateway,
            context: f.input.context,
            onToolAudit: (event) => store.appendToolAudit(claim, event)
          },
          host
        )
        expect(trace.status).toBe('failed')
        expect(trace.response.mode).toBe('handoff')
        expect(trace.tools.every((t) => t.status !== 'succeeded')).toBe(true)
        expect((await f.authority.get(approval.id, tenantId))?.status).toBe(
          'issued'
        )
        expect(
          (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                "SELECT id FROM audit_events WHERE tenant_id=$1 AND type='approval_decision' AND payload->>'approvalId'=$2",
                [tenantId, approval.id]
              )
            )
          ).rows
        ).toHaveLength(0)
        const binding = (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              'SELECT approval_receipt FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
              [tenantId, claim.executionId]
            )
          )
        ).rows[0]!
        expect(binding.approval_receipt).toBeNull()
        expect(
          (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                "SELECT * FROM controlled_published_evidence WHERE tenant_id=$1 AND execution_id=$2 AND event_type='approval.consumed'",
                [tenantId, claim.executionId]
              )
            )
          ).rows
        ).toHaveLength(0)
      } finally {
        await admin.query(
          `DROP TRIGGER ${trigger} ON ${schema}.controlled_published_evidence`
        )
        await admin.query(`DROP FUNCTION ${schema}.${trigger}()`)
      }
    })

    it('a synthetic high-risk medical request closes policy-denied with safe handoff and no tool', async () => {
      const f = await fixture(
        true,
        false,
        60000,
        'Qual a dose de dipirona para um animal fictício?'
      )
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef),
        host = store.createHost(
          claim,
          lifecycle(),
          new AbortController().signal
        )
      const trace = await executeConfiguredAgent(
        {
          store: f.platform,
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          message: f.input.message,
          history: [],
          executionMode: 'CONTROLLED_RUNTIME',
          actor: f.actor,
          capabilityGateway: f.gateway,
          context: f.input.context
        },
        host
      )
      expect(trace.tools).toEqual([])
      expect(trace.response.mode).toBe('handoff')
      expect(trace.status).not.toBe('completed')
      const closed = (
        await withTenantContext(pool, tenantId, (c) =>
          c.query(
            `SELECT e.state,e.failure,b.runtime_result,b.phase_state FROM operational_executions e
        JOIN controlled_published_bindings b ON b.tenant_id=e.tenant_id AND b.execution_id=e.id WHERE e.tenant_id=$1 AND e.id=$2`,
            [tenantId, claim.executionId]
          )
        )
      ).rows[0]!
      expect(closed).toMatchObject({
        state: 'FAILED_TERMINAL',
        phase_state: 'CLOSED',
        failure: { kind: 'POLICY_DENIED' },
        runtime_result: { stopReason: 'POLICY_DENIED' }
      })
    })

    for (const wrong of ['output', 'fingerprint'] as const)
      it(`a kernel-produced checkpoint cannot seal a plan intent for another ${wrong}`, async () => {
        const f = await fixture(true)
        await store.admit(f.admission, f.claimed.claimRef)
        const claim = await store.claim(
            f.input.executionId,
            f.claimed.claimRef
          ),
          host = store.createHost(
            claim,
            lifecycle(),
            new AbortController().signal
          )
        const begin = host.continuation.beginPhase,
          ack = host.continuation.ackPhase,
          save = host.continuation.saveResumePoint
        const actualPhases = new Map<string, ControlledPhaseRef>()
        host.continuation.beginPhase = async (fence, seal, type, digest) => {
          const actual = await begin(
            fence,
            seal,
            type,
            type === 'plan.seal'
              ? controlledDigest({ [wrong]: 'different-synthetic-binding' })
              : digest
          )
          if (type === 'plan.seal') {
            actualPhases.set(actual.phaseId, actual)
            return { ...actual, inputDigest: digest }
          }
          return actual
        }
        host.continuation.ackPhase = (fence, phase, payload) =>
          ack(fence, actualPhases.get(phase.phaseId) ?? phase, payload)
        let checked = false
        host.continuation.saveResumePoint = async (...args) => {
          const before = (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                'SELECT state,state_revision,seal_id,sealed_checkpoint FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
                [tenantId, claim.executionId]
              )
            )
          ).rows[0]!
          validateCheckpointIntegrity(args[2], {
            tenantId,
            executionId: claim.executionId
          })
          await expect(save(...args)).rejects.toMatchObject({
            code: 'conflict'
          })
          const after = (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                'SELECT state,state_revision,seal_id,sealed_checkpoint FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
                [tenantId, claim.executionId]
              )
            )
          ).rows[0]!
          expect(after).toEqual(before)
          expect(after.state).toBeNull()
          expect(
            await new PostgresExecutionStepStore(pool).loadCheckpoint(
              tenantId,
              claim.executionId
            )
          ).toBeNull()
          checked = true
          throw new Error('Synthetic inconsistent plan certificate rejected')
        }
        const trace = await executeConfiguredAgent(
          {
            store: f.platform,
            tenantId,
            agentId: f.input.agentId,
            versionId: f.input.versionId,
            traceId: f.input.traceId,
            message: f.input.message,
            history: [],
            executionMode: 'CONTROLLED_RUNTIME',
            actor: f.actor,
            capabilityGateway: f.gateway,
            context: f.input.context
          },
          host
        )
        expect(checked).toBe(true)
        expect(trace.status).toBe('failed')
        expect(trace.response.mode).toBe('handoff')
      })

    for (const mode of [
      'near-deadline',
      'expired',
      'faulted',
      'dispatch-closed'
    ] as const)
      it(`paired renewal uses live authority and fixed deadline: ${mode}`, async () => {
        const f = await fixture(
          false,
          false,
          mode === 'near-deadline' ? 3000 : mode === 'expired' ? 1000 : 60000
        )
        await store.admit(f.admission, f.claimed.claimRef)
        const claim = await store.claim(
            f.input.executionId,
            f.claimed.claimRef
          ),
          host = store.createHost(
            claim,
            lifecycle(),
            new AbortController().signal
          )
        const prepared: ControlledPublishedPrepared = {
          schema: 'controlled-published-prepared-v1',
          requestDigest: claim.requestDigest,
          fingerprint: claim.fingerprint,
          message: f.input.message,
          history: [],
          promptWithHistory: 'Synthetic prepared prompt',
          intent: 'scheduling',
          policy: {
            decision: 'allowed',
            reason: 'synthetic',
            layer: 'agent_behavior',
            policyVersion: 'synthetic217'
          },
          risk: { level: 'low', reason: 'synthetic' },
          response: { mode: 'answer', text: 'Resposta controlada.' },
          sourceIds: [],
          configDigest: controlledDigest(f.version.config)
        }
        const started = await host.continuation.startPrepared(
          host.identity,
          prepared,
          f.admission.runtime
        )
        if (mode === 'expired')
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.max(0, Date.parse(started.expiresAt) - Date.now()) + 150
            )
          )
        if (mode === 'faulted')
          await host.continuation.poison(
            host.identity,
            'synthetic-renewal-veto',
            'evidence_unavailable'
          )
        if (mode === 'dispatch-closed')
          await withTenantTransaction(pool, tenantId, async (client) => {
            await client.query(
              `SELECT set_config('cvg.published_execution',$1,true),set_config('cvg.published_worker',$2,true),
          set_config('cvg.published_attempt',$3,true),set_config('cvg.published_mode','settlement',true)`,
              [
                claim.executionId,
                claim.fence.workerId,
                String(claim.fence.attempt)
              ]
            )
            await client.query(
              'UPDATE controlled_published_bindings SET dispatch_closed=true WHERE tenant_id=$1 AND execution_id=$2',
              [tenantId, claim.executionId]
            )
          })
        const read = async () =>
          (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                `SELECT e.lease_until AS inner_until,q.lease_until AS queue_until,o.lease_until AS outer_until,b.expires_at
        FROM operational_executions e JOIN controlled_published_bindings b ON b.tenant_id=e.tenant_id AND b.execution_id=e.id
        JOIN operational_execution_outbox q ON q.tenant_id=e.tenant_id AND q.execution_id=e.id
        JOIN outbox_events o ON o.tenant_id=b.tenant_id AND o.id=b.outbox_id WHERE e.tenant_id=$1 AND e.id=$2`,
                [tenantId, claim.executionId]
              )
            )
          ).rows[0]!
        const before = await read(),
          control = { signal: new AbortController().signal, assertActive() {} }
        if (mode === 'near-deadline') {
          const renewed = await store.renewPaired(
              claim.fence.outer,
              claim.fence,
              control
            ),
            after = await read()
          expect(after.inner_until).toEqual(new Date(started.expiresAt))
          expect(after.queue_until).toEqual(after.inner_until)
          expect(after.outer_until.getTime() - Date.parse(renewed.dbNow)).toBe(
            10000
          )
          expect(after.expires_at).toEqual(before.expires_at)
        } else {
          if (mode === 'expired')
            expect(before.inner_until.getTime()).toBeGreaterThan(Date.now())
          await expect(
            store.renewPaired(claim.fence.outer, claim.fence, control)
          ).rejects.toMatchObject({ code: 'lease_lost' })
          expect(await read()).toEqual(before)
        }
      })

    async function setPause(paused: boolean) {
      await withTenantTransaction(pool, tenantId, (client) =>
        client.query(
          `INSERT INTO kernel_pause_switches(tenant_id,paused,updated_by)
        VALUES($1,$2,'operator.synthetic') ON CONFLICT(tenant_id) DO UPDATE SET paused=EXCLUDED.paused,updated_by=EXCLUDED.updated_by`,
          [tenantId, paused]
        )
      )
    }
    it('a committed prestart pause leaves S0 queued with no phase/close and unpause can execute', async () => {
      const f = await fixture(true)
      await store.admit(f.admission, f.claimed.claimRef)
      await setPause(true)
      try {
        await expect(
          store.claim(f.input.executionId, f.claimed.claimRef)
        ).rejects.toMatchObject({ code: 'lease_lost' })
        const deferred = (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              `SELECT b.phase_state,b.closed_trace,b.evidence_sequence,e.state,e.attempt FROM controlled_published_bindings b
          JOIN operational_executions e ON e.tenant_id=b.tenant_id AND e.id=b.execution_id WHERE b.tenant_id=$1 AND b.execution_id=$2`,
              [tenantId, f.input.executionId]
            )
          )
        ).rows[0]!
        expect(deferred).toEqual({
          phase_state: 'IDLE_SEALED',
          closed_trace: null,
          evidence_sequence: 0,
          state: 'QUEUED',
          attempt: 0
        })
        expect(
          (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                'SELECT * FROM outbox_effects WHERE tenant_id=$1 AND event_id=$2',
                [tenantId, f.claimed.event.id]
              )
            )
          ).rows
        ).toHaveLength(0)
      } finally {
        await setPause(false)
      }
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef),
        host = store.createHost(
          claim,
          lifecycle(),
          new AbortController().signal
        )
      const trace = await executeConfiguredAgent(
        {
          store: f.platform,
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          message: f.input.message,
          history: [],
          executionMode: 'CONTROLLED_RUNTIME',
          actor: f.actor,
          capabilityGateway: f.gateway,
          context: f.input.context,
          onToolAudit: (event) => store.appendToolAudit(claim, event)
        },
        host
      )
      expect(trace.tools).toEqual([
        { name: 'find_available_slots', status: 'succeeded' }
      ])
    })
    it('pause committed before the dispatch-permit transaction prevents a permit and body admission', async () => {
      const f = await fixture(true)
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef),
        host = store.createHost(
          claim,
          lifecycle(),
          new AbortController().signal
        )
      const prepare = host.admission.prepareDispatch
      host.admission.prepareDispatch = async (...args) => {
        await setPause(true)
        return prepare(...args)
      }
      try {
        const trace = await executeConfiguredAgent(
          {
            store: f.platform,
            tenantId,
            agentId: f.input.agentId,
            versionId: f.input.versionId,
            traceId: f.input.traceId,
            message: f.input.message,
            history: [],
            executionMode: 'CONTROLLED_RUNTIME',
            actor: f.actor,
            capabilityGateway: f.gateway,
            context: f.input.context,
            onToolAudit: (event) => store.appendToolAudit(claim, event)
          },
          host
        )
        expect(trace.status).not.toBe('completed')
        expect(trace.response.mode).toBe('handoff')
        expect(trace.tools.every((t) => t.status !== 'succeeded')).toBe(true)
        expect(
          (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                "SELECT * FROM controlled_published_evidence WHERE tenant_id=$1 AND execution_id=$2 AND event_type='dispatch.permit'",
                [tenantId, claim.executionId]
              )
            )
          ).rows
        ).toHaveLength(0)
        await setPause(false)
        const replay = await store.claim(claim.executionId, f.claimed.claimRef)
        expect(replay.disposition).toBe('CLOSED')
        expect(replay.state.closedTrace).toEqual(trace)
      } finally {
        await setPause(false)
      }
    })
    for (const guard of ['pause', 'takeover'] as const)
      it(`${guard} committed before bound0002 prevents consumption and leaves no receipt`, async () => {
        const f = await fixture(true, true)
        const approval = await f.authority.issue({
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          toolName: 'find_available_slots',
          input: { message: f.input.message },
          actorId: f.actor.id,
          issuer: 'human.synthetic',
          expiresAt: new Date(Date.now() + 60000)
        })
        await store.admit(f.admission, f.claimed.claimRef)
        const claim = await store.claim(
            f.input.executionId,
            f.claimed.claimRef
          ),
          host = store.createHost(
            claim,
            lifecycle(),
            new AbortController().signal
          )
        const consume = host.approvalConsumption.consumeBoundApproval
        host.approvalConsumption.consumeBoundApproval = async (...args) => {
          if (guard === 'pause') await setPause(true)
          else
            await withTenantTransaction(pool, tenantId, (c) =>
              c.query(
                "UPDATE sessions SET takeover_state='HUMAN_ACTIVE' WHERE tenant_id=$1 AND id=$2",
                [tenantId, f.input.context.sessionId]
              )
            )
          return consume(...args)
        }
        try {
          const trace = await executeConfiguredAgent(
            {
              store: f.platform,
              tenantId,
              agentId: f.input.agentId,
              versionId: f.input.versionId,
              traceId: f.input.traceId,
              message: f.input.message,
              history: [],
              executionMode: 'CONTROLLED_RUNTIME',
              actor: f.actor,
              requireCapabilityApproval: true,
              capabilityApproval: {
                id: approval.id,
                tenantId,
                agentId: f.input.agentId,
                versionId: f.input.versionId,
                toolName: 'find_available_slots',
                actorId: f.actor.id,
                expiresAt: approval.expiresAt
              },
              capabilityGateway: f.gateway,
              context: f.input.context,
              onToolAudit: (event) => store.appendToolAudit(claim, event)
            },
            host
          )
          expect(trace.status).not.toBe('completed')
          expect(trace.response.mode).toBe('handoff')
          expect((await f.authority.get(approval.id, tenantId))?.status).toBe(
            'issued'
          )
          const b = (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                'SELECT approval_receipt,phase_state FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
                [tenantId, claim.executionId]
              )
            )
          ).rows[0]!
          expect(b).toEqual({ approval_receipt: null, phase_state: 'CLOSED' })
        } finally {
          await setPause(false)
        }
      })

    it('rejects unfinalized/foreign final snapshots and foreign callback correlation before committing success', async () => {
      const f = await fixture(true)
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef)
      const host = store.createHost(
        claim,
        lifecycle(),
        new AbortController().signal
      )
      const close = host.continuation.close
      let rejected = 0
      host.continuation.close = async (
        fence,
        snapshot,
        result,
        trace,
        revision
      ) => {
        if (!snapshot)
          throw new Error('Actual completed fixture lacks final snapshot')
        for (const bad of [
          { ...snapshot, finalIssued: false },
          { ...snapshot, planSealed: false },
          { ...snapshot, safePoint: 'S1' as const },
          { ...snapshot, executionId: 'exec_foreign' }
        ]) {
          await expect(
            close(fence, bad, result, trace, revision)
          ).rejects.toMatchObject({ code: 'conflict' })
          const parent = (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                'SELECT state FROM operational_executions WHERE tenant_id=$1 AND id=$2',
                [tenantId, claim.executionId]
              )
            )
          ).rows[0]!
          expect(parent.state).toBe('RUNNING')
          rejected++
        }
        for (const bad of [
          { ...trace, tools: [], toolResults: [] },
          {
            ...trace,
            tools: trace.tools.map((t) => ({
              ...t,
              status: 'not_run' as const
            })),
            toolResults: trace.tools.map((t) => ({
              name: t.name,
              status: 'not_run' as const,
              output: null
            }))
          },
          {
            ...trace,
            response: { ...trace.response, text: 'Different synthetic reply' }
          }
        ]) {
          await expect(
            close(
              fence,
              snapshot,
              { ...result, response: bad.response.text },
              bad,
              revision
            )
          ).rejects.toMatchObject({ code: 'conflict' })
          const unchanged = (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                `SELECT b.closed_trace,e.state FROM controlled_published_bindings b
            JOIN operational_executions e ON e.tenant_id=b.tenant_id AND e.id=b.execution_id WHERE b.tenant_id=$1 AND b.execution_id=$2`,
                [tenantId, claim.executionId]
              )
            )
          ).rows[0]!
          expect(unchanged).toEqual({ closed_trace: null, state: 'RUNNING' })
          rejected++
        }
        await close(fence, snapshot, result, trace, revision)
      }
      const trace = await executeConfiguredAgent(
        {
          store: f.platform,
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          message: f.input.message,
          history: [],
          executionMode: 'CONTROLLED_RUNTIME',
          actor: f.actor,
          capabilityGateway: f.gateway,
          context: f.input.context,
          onToolAudit: async (event) => {
            await expect(
              store.appendToolAudit(claim, {
                ...event,
                correlationId: createCorrelationId()
              })
            ).rejects.toMatchObject({ code: 'lease_lost' })
            await expect(
              store.appendToolAudit(claim, { ...event, status: 'failed' })
            ).rejects.toMatchObject({ code: 'conflict' })
            await store.appendToolAudit(claim, event)
          }
        },
        host
      )
      expect(trace.status).toBe('completed')
      expect(rejected).toBe(7)
    })

    it('a rejected mandatory terminal audit closes failed/handoff and cannot persist SUCCEEDED', async () => {
      const f = await fixture()
      await store.admit(f.admission, f.claimed.claimRef)
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef)
      const host = store.createHost(
        claim,
        lifecycle(),
        new AbortController().signal
      )
      const append = host.ports.audit.append
      host.ports.audit.append = async (event) => {
        if (event.action === 'runtime.completed')
          throw new Error('Synthetic terminal audit outage')
        await append(event)
      }
      const trace = await executeConfiguredAgent(
        {
          store: f.platform,
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          message: f.input.message,
          history: [],
          executionMode: 'CONTROLLED_RUNTIME',
          actor: f.actor,
          capabilityGateway: f.gateway,
          context: f.input.context
        },
        host
      )
      expect(trace.status).toBe('failed')
      expect(trace.response.mode).toBe('handoff')
      const result = (
        await withTenantContext(pool, tenantId, (c) =>
          c.query(
            `SELECT e.state,b.phase_state,b.runtime_result,b.fault FROM operational_executions e
        JOIN controlled_published_bindings b ON b.tenant_id=e.tenant_id AND b.execution_id=e.id WHERE e.tenant_id=$1 AND e.id=$2`,
            [tenantId, claim.executionId]
          )
        )
      ).rows[0]!
      expect(result).toMatchObject({
        state: 'FAILED_TERMINAL',
        phase_state: 'CLOSED',
        runtime_result: { stopReason: 'INSUFFICIENT_EVIDENCE' }
      })
      expect(result.fault).not.toBeNull()
    })

    it('rejects swapped input/actor/step/execution and abort during a real0002 lock wait before any grant mutation', async () => {
      const f = await fixture(true, true),
        claim = await recoveredS1(f, 'approval-negatives-s1')
      const controller = new AbortController(),
        host = store.createHost(claim, lifecycle(), controller.signal)
      const grant = await f.authority.issue({
        tenantId,
        agentId: f.input.agentId,
        versionId: f.input.versionId,
        toolName: 'find_available_slots',
        input: { message: f.input.message },
        actorId: f.actor.id,
        issuer: 'human.synthetic',
        expiresAt: new Date(Date.now() + 60000)
      })
      const command = claim.state.snapshot!.attempts[0]!.command
      const phase = await host.continuation.beginPhase(
        host.identity,
        host.state.sealId,
        'approval.begin',
        controlledDigest({ approvalId: grant.id, inputHash: command.inputHash })
      )
      const verification = {
        approvalId: grant.id,
        tenantId,
        agentId: f.input.agentId,
        versionId: f.input.versionId,
        toolName: 'find_available_slots',
        input: { message: f.input.message },
        actorId: f.actor.id,
        executionRef: claim.executionId,
        operationKey: `${claim.executionId}:s2:find_available_slots`,
        stepNumber: 2,
        stepId: `step_${claim.executionId}_2_tool`,
        requestDigest: claim.requestDigest,
        fingerprint: claim.fingerprint,
        consumptionAudit: {
          correlationId: f.input.correlationId,
          traceId: f.input.traceId,
          policyVersion: 'capability-approval-v1'
        }
      }
      for (const foreignBinding of [
        { input: { message: 'Outro pedido sintético' }, actorId: f.actor.id },
        { input: { message: f.input.message }, actorId: 'other.synthetic' }
      ]) {
        const foreign = await f.authority.issue({
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          toolName: 'find_available_slots',
          ...foreignBinding,
          issuer: 'human.synthetic',
          expiresAt: new Date(Date.now() + 60000)
        })
        await expect(
          host.approvalConsumption.consumeBoundApproval(host.identity, phase, {
            ...verification,
            ...foreignBinding,
            approvalId: foreign.id
          })
        ).rejects.toMatchObject({ code: 'lease_lost' })
        expect((await f.authority.get(foreign.id, tenantId))?.status).toBe(
          'issued'
        )
      }
      for (const changed of [
        { input: { message: 'Outro pedido sintético' } },
        { actorId: 'other.synthetic' },
        { stepId: 'other_step' },
        { executionRef: 'exec_other' },
        { operationKey: 'other_operation' }
      ]) {
        await expect(
          host.approvalConsumption.consumeBoundApproval(host.identity, phase, {
            ...verification,
            ...changed
          })
        ).rejects.toMatchObject({ code: 'lease_lost' })
        expect((await f.authority.get(grant.id, tenantId))?.status).toBe(
          'issued'
        )
      }
      const lock = await pool.connect()
      try {
        await lock.query('BEGIN')
        await lock.query("SELECT set_config('cvg.tenant_id',$1,true)", [
          tenantId
        ])
        await lock.query(
          'SELECT id FROM platform_capability_approvals WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [tenantId, grant.id]
        )
        const result = host.approvalConsumption
          .consumeBoundApproval(host.identity, phase, verification)
          .then(
            (value) => ({ value, error: undefined }),
            (error) => ({ value: undefined, error })
          )
        const timeout = Date.now() + 3000
        let waiting = false
        while (Date.now() < timeout) {
          const rows = await pool.query(
            "SELECT 1 FROM pg_stat_activity WHERE usename=current_user AND wait_event_type='Lock' AND query LIKE '%platform_capability_approvals%'"
          )
          if (rows.rowCount) {
            waiting = true
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
        expect(waiting).toBe(true)
        controller.abort(
          new Error('Synthetic attempt stopped during grant lock')
        )
        await lock.query('ROLLBACK')
        const stopped = await result
        expect(stopped.error).toMatchObject({ code: 'lease_lost' })
        expect((await f.authority.get(grant.id, tenantId))?.status).toBe(
          'issued'
        )
        const rows = (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              `SELECT approval_receipt,state FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2`,
              [tenantId, claim.executionId]
            )
          )
        ).rows[0]!
        expect(rows.approval_receipt).toBeNull()
        expect(rows.state.attempts[0].approvalConsumed).toBe(false)
        expect(
          (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                `SELECT id FROM audit_events WHERE tenant_id=$1 AND type='approval_decision' AND payload->>'approvalId'=$2`,
                [tenantId, grant.id]
              )
            )
          ).rows
        ).toHaveLength(0)
      } finally {
        await lock.query('ROLLBACK').catch(() => undefined)
        lock.release()
      }
      await host.continuation.poison(
        host.identity,
        'synthetic_abort',
        'evidence_unavailable'
      )
    }, 120000)

    it('rejects a genuinely valid foreign checkpoint and a non-planner S1 seal without changing either execution', async () => {
      const f = await fixture(true),
        claim = await recoveredS1(f, 'foreign-checkpoint-s1')
      const host = store.createHost(
        claim,
        lifecycle(),
        new AbortController().signal
      )
      const foreignId = `exec_${randomUUID()}`
      await new PostgresOperationalExecutionStore(pool, {
        executionIdFactory: () => foreignId
      }).submit({
        tenantId,
        idempotencyKey: `synthetic-foreign:${randomUUID()}`,
        capabilityFingerprint: claim.fingerprint,
        runtime: { ...f.admission.runtime, executionId: foreignId }
      })
      const checkpoint = claim.state.checkpoint!
      const { checkpointId, createdAt, digest, ...unsigned } = checkpoint
      void checkpointId
      void createdAt
      void digest
      const foreign = sealCheckpoint({ ...unsigned, executionId: foreignId })
      validateCheckpointIntegrity(foreign, { tenantId, executionId: foreignId })
      const snapshot = claim.state.snapshot!
      const phase = await host.continuation.beginPhase(
        host.identity,
        host.state.sealId,
        'plan.seal',
        controlledDigest({
          outputDigest: snapshot.outputDigest,
          fingerprint: claim.fingerprint
        })
      )
      const ack = await host.continuation.ackPhase(host.identity, phase, {
        phaseType: phase.phaseType,
        completed: true
      })
      const before = (
        await withTenantContext(pool, tenantId, (c) =>
          c.query(
            'SELECT state,seal_id,state_revision,sealed_checkpoint FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
            [tenantId, claim.executionId]
          )
        )
      ).rows[0]!
      await expect(
        host.continuation.saveResumePoint(
          host.identity,
          snapshot,
          foreign,
          ack.sequence,
          host.state.stateRevision
        )
      ).rejects.toMatchObject({ code: 'conflict' })
      expect(
        await new PostgresExecutionStepStore(pool).loadCheckpoint(
          tenantId,
          foreignId
        )
      ).toBeNull()
      const nonPlan = await host.continuation.beginPhase(
        host.identity,
        host.state.sealId,
        'pause.read',
        controlledDigest({})
      )
      const ack2 = await host.continuation.ackPhase(host.identity, nonPlan, {
        phaseType: nonPlan.phaseType,
        completed: true
      })
      await expect(
        host.continuation.saveResumePoint(
          host.identity,
          snapshot,
          checkpoint,
          ack2.sequence,
          host.state.stateRevision
        )
      ).rejects.toMatchObject({ code: 'conflict' })
      const after = (
        await withTenantContext(pool, tenantId, (c) =>
          c.query(
            'SELECT state,seal_id,state_revision,sealed_checkpoint FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
            [tenantId, claim.executionId]
          )
        )
      ).rows[0]!
      expect(after).toEqual(before)
      expect(
        await new PostgresExecutionStepStore(pool).loadCheckpoint(
          tenantId,
          claim.executionId
        )
      ).toEqual(checkpoint)
    }, 120000)

    for (const quota of ['bytes', 'sequence'] as const)
      it(`reserves terminal ${quota} capacity and rejects the next operation before admission`, async () => {
        const f = await fixture()
        await store.admit(f.admission, f.claimed.claimRef)
        const claim = await store.claim(f.input.executionId, f.claimed.claimRef)
        const host = store.createHost(
          claim,
          lifecycle(),
          new AbortController().signal
        )
        let completed = 0,
          rejected: unknown
        for (let n = 0; n < 130; n++) {
          if (n % 8 === 0)
            await store.renewPaired(claim.fence.outer, claim.fence, {
              signal: new AbortController().signal,
              assertActive() {}
            })
          let phase
          try {
            phase = await host.continuation.beginPhase(
              host.identity,
              host.state.sealId,
              'quota.fixture',
              controlledDigest({ n })
            )
          } catch (error) {
            rejected = error
            break
          }
          completed++
          await host.continuation.ackPhase(
            host.identity,
            phase,
            quota === 'bytes'
              ? { data: 'x'.repeat(200000) }
              : { phaseType: phase.phaseType, completed: true }
          )
        }
        expect(rejected).toMatchObject({ code: 'conflict' })
        expect(completed).toBeGreaterThan(0)
        const before = (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              'SELECT evidence_sequence,evidence_bytes FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
              [tenantId, claim.executionId]
            )
          )
        ).rows[0]!
        expect(before.evidence_sequence).toBeLessThanOrEqual(248)
        expect(before.evidence_bytes).toBeLessThanOrEqual(4194304 - 8 * 262144)
        if (quota === 'bytes') {
          expect(before.evidence_bytes).toBeGreaterThan(1000000)
          expect(before.evidence_sequence).toBeLessThan(100)
        } else expect(before.evidence_sequence).toBeGreaterThanOrEqual(244)
        await host.continuation.poison(
          host.identity,
          'quota',
          'evidence_unavailable'
        )
        host.state = { ...host.state, phaseState: 'FAULTED' }
        const trace = await executeConfiguredAgent(
          {
            store: f.platform,
            tenantId,
            agentId: f.input.agentId,
            versionId: f.input.versionId,
            traceId: f.input.traceId,
            message: f.input.message,
            history: [],
            executionMode: 'CONTROLLED_RUNTIME',
            actor: f.actor,
            capabilityGateway: f.gateway,
            context: f.input.context
          },
          host
        )
        expect(trace.status).toBe('failed')
        expect(trace.response.mode).toBe('handoff')
        const after = (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              'SELECT phase_state,fault,evidence_sequence,evidence_bytes FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
              [tenantId, claim.executionId]
            )
          )
        ).rows[0]!
        expect(after.phase_state).toBe('CLOSED')
        expect(after.fault).toMatchObject({
          phase: 'quota',
          code: 'evidence_unavailable'
        })
        expect(after.evidence_sequence).toBe(before.evidence_sequence + 2)
        expect(after.evidence_bytes).toBeLessThanOrEqual(4194304)
      }, 120000)

    it('closes an already CANCELLED S0 without acquiring an inner lease, changing attempt or running the model/tool', async () => {
      const f = await fixture(true)
      await store.admit(f.admission, f.claimed.claimRef)
      const cancellation = await new PostgresOperationalExecutionStore(
        pool
      ).cancel({
        tenantId,
        executionId: f.input.executionId,
        actorId: 'operator.synthetic',
        reason: 'Synthetic cancellation'
      })
      expect(cancellation).toMatchObject({
        state: 'CANCELLED',
        attempt: 0,
        leaseOwner: null,
        leaseUntil: null
      })
      const claim = await store.claim(f.input.executionId, f.claimed.claimRef)
      expect(claim.disposition).toBe('CANCELLED')
      expect(claim.fence.attempt).toBe(0)
      const host = store.createHost(
        claim,
        lifecycle(),
        new AbortController().signal
      )
      const trace = await executeConfiguredAgent(
        {
          store: f.platform,
          tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          message: f.input.message,
          history: [],
          executionMode: 'CONTROLLED_RUNTIME',
          actor: f.actor,
          capabilityGateway: f.gateway,
          context: f.input.context
        },
        host
      )
      expect(trace.status).toBe('failed')
      expect(trace.response.mode).toBe('handoff')
      expect(trace.tools).toEqual([])
      const closed = (
        await withTenantContext(pool, tenantId, (c) =>
          c.query(
            `SELECT b.phase_state,b.runtime_result,e.attempt,e.state,e.lease_owner,e.lease_until
        FROM controlled_published_bindings b JOIN operational_executions e ON e.tenant_id=b.tenant_id AND e.id=b.execution_id
        WHERE b.tenant_id=$1 AND b.execution_id=$2`,
            [tenantId, claim.executionId]
          )
        )
      ).rows[0]!
      expect(closed).toMatchObject({
        phase_state: 'CLOSED',
        attempt: 0,
        state: 'CANCELLED',
        lease_owner: null,
        lease_until: null,
        runtime_result: { stopReason: 'CANCELLED' }
      })
      expect(
        (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              'SELECT * FROM controlled_published_evidence WHERE tenant_id=$1 AND execution_id=$2',
              [tenantId, claim.executionId]
            )
          )
        ).rows
      ).toHaveLength(1)
      const replay = await store.claim(claim.executionId, f.claimed.claimRef)
      expect(replay.disposition).toBe('CLOSED')
      expect(replay.state.closedTrace).toEqual(trace)
    })

    it('a live process renews the paired10s leases for25s with one attempt and a fixed deadline', async () => {
      const f = await fixture(true)
      await store.admit(f.admission, f.claimed.claimRef)
      const child = await childProcess(f, 'live25-process', 'S1', true)
      try {
        await child.awaitPoint('S1')
        const before = (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              `SELECT clock_timestamp() AS now,b.expires_at,e.lease_until,o.lease_until AS outer_until
          FROM controlled_published_bindings b JOIN operational_executions e ON e.tenant_id=b.tenant_id AND e.id=b.execution_id
          JOIN outbox_events o ON o.tenant_id=b.tenant_id AND o.id=b.outbox_id WHERE b.tenant_id=$1 AND b.execution_id=$2`,
              [tenantId, f.input.executionId]
            )
          )
        ).rows[0]!
        await new Promise((resolve) => setTimeout(resolve, 25000))
        expect(child.child.exitCode).toBeNull()
        expect(child.child.signalCode).toBeNull()
        const after = (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              `SELECT clock_timestamp() AS now,b.expires_at,e.attempt,e.lease_until,o.attempts,o.lease_until AS outer_until
          FROM controlled_published_bindings b JOIN operational_executions e ON e.tenant_id=b.tenant_id AND e.id=b.execution_id
          JOIN outbox_events o ON o.tenant_id=b.tenant_id AND o.id=b.outbox_id WHERE b.tenant_id=$1 AND b.execution_id=$2`,
              [tenantId, f.input.executionId]
            )
          )
        ).rows[0]!
        expect(after.attempt).toBe(1)
        expect(after.attempts).toBe(1)
        expect(after.expires_at).toEqual(before.expires_at)
        expect(after.lease_until.getTime()).toBeGreaterThan(after.now.getTime())
        expect(after.outer_until.getTime()).toBeGreaterThan(after.now.getTime())
        expect(
          after.lease_until.getTime() - before.lease_until.getTime()
        ).toBeGreaterThan(20000)
        expect(
          after.outer_until.getTime() - before.outer_until.getTime()
        ).toBeGreaterThan(20000)
        console.info(
          'PARE217_LIVE25',
          JSON.stringify({ pid: child.child.pid, before, after })
        )
      } finally {
        if (child.child.exitCode === null && child.child.signalCode === null)
          child.child.kill('SIGKILL')
        await child.record()
      }
    }, 120000)

    it('native downtime beyond the original DB deadline closes failed/handoff with no new model/plan/parse/body', async () => {
      const f = await fixture(true)
      await store.admit(f.admission, f.claimed.claimRef)
      const first = await childProcess(f, 'deadline-process-a', 'S1', true)
      let second: Awaited<ReturnType<typeof childProcess>> | undefined
      try {
        const marker = await first.awaitPoint('S1')
        expect(marker.counts).toEqual({
          model: 1,
          plan: 1,
          inputParse: 1,
          body: 0
        })
        first.child.kill('SIGKILL')
        expect(await first.record()).toEqual({ code: null, signal: 'SIGKILL' })
        const original = (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              'SELECT started_at,expires_at,clock_timestamp() AS now FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
              [tenantId, f.input.executionId]
            )
          )
        ).rows[0]!
        expect(
          original.expires_at.getTime() - original.started_at.getTime()
        ).toBe(60000)
        const delay =
          original.expires_at.getTime() - original.now.getTime() + 1200
        expect(delay).toBeGreaterThan(1000)
        expect(delay).toBeLessThanOrEqual(61200)
        // The wait is ordinary wall/DB time; no expiry override or admin timestamp update.
        const firstWait = Math.min(delay, 30000)
        await new Promise((resolve) => setTimeout(resolve, firstWait))
        if (delay > firstWait)
          await new Promise((resolve) => setTimeout(resolve, delay - firstWait))
        second = await childProcess(f, 'deadline-process-b')
        const result = await second.awaitPoint('RESULT'),
          projected = await second.awaitPoint('TRACE')
        expect(await second.record()).toEqual({ code: 0, signal: null })
        expect(result.counts).toEqual({
          model: 0,
          plan: 0,
          inputParse: 0,
          body: 0
        })
        const trace = projected.trace as {
          status: string
          response: { mode: string }
          tools: { status: string }[]
        }
        expect(trace.status).toBe('failed')
        expect(trace.response.mode).toBe('handoff')
        expect(trace.tools.every((t) => t.status !== 'succeeded')).toBe(true)
        const closed = (
          await withTenantContext(pool, tenantId, (c) =>
            c.query(
              'SELECT started_at,expires_at,phase_state FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
              [tenantId, f.input.executionId]
            )
          )
        ).rows[0]!
        expect(closed).toEqual({
          started_at: original.started_at,
          expires_at: original.expires_at,
          phase_state: 'CLOSED'
        })
      } finally {
        if (first.child.exitCode === null && first.child.signalCode === null)
          first.child.kill('SIGKILL')
        if (
          second &&
          second.child.exitCode === null &&
          second.child.signalCode === null
        )
          second.child.kill('SIGKILL')
        await first.record()
        if (second) await second.record()
      }
    }, 120000)

    for (const crash of [
      'INTENT',
      'ACKED',
      'P0',
      'ROLLBACK',
      'SEAL_ROLLBACK'
    ] as const)
      it(`native ${crash} recovery follows durable phase state and cannot repeat an uncertain operation`, async () => {
        const f = await fixture(true)
        await store.admit(f.admission, f.claimed.claimRef)
        const first = await childProcess(
          f,
          `${crash.toLowerCase()}-process-a`,
          crash,
          true
        )
        let second: Awaited<ReturnType<typeof childProcess>> | undefined
        try {
          const marker = await first.awaitPoint(crash)
          expect(marker.counts).toEqual({
            model: 1,
            plan: 1,
            inputParse: 1,
            body: 0
          })
          if (['P0', 'ROLLBACK', 'SEAL_ROLLBACK'].includes(crash))
            expect(await first.record()).toEqual({ code: 1, signal: null })
          else {
            first.child.kill('SIGKILL')
            expect(await first.record()).toEqual({
              code: null,
              signal: 'SIGKILL'
            })
          }
          const before = (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                `SELECT b.phase_state,b.fault,b.expires_at,e.lease_until,o.lease_until AS outer_until,clock_timestamp() AS now
          FROM controlled_published_bindings b JOIN operational_executions e ON e.tenant_id=b.tenant_id AND e.id=b.execution_id
          JOIN outbox_events o ON o.tenant_id=b.tenant_id AND o.id=b.outbox_id WHERE b.tenant_id=$1 AND b.execution_id=$2`,
                [tenantId, f.input.executionId]
              )
            )
          ).rows[0]!
          expect(before.phase_state).toBe(
            ['P0', 'ROLLBACK'].includes(crash) ? 'IDLE_SEALED' : 'OPEN'
          )
          expect(before.fault).toBeNull()
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.max(
                before.lease_until.getTime(),
                before.outer_until.getTime()
              ) -
                before.now.getTime() +
                150
            )
          )
          second = await childProcess(f, `${crash.toLowerCase()}-process-b`)
          const result = await second.awaitPoint('RESULT'),
            traceMessage = await second.awaitPoint('TRACE')
          expect(await second.record()).toEqual({ code: 0, signal: null })
          expect(result.pid).not.toBe(marker.pid)
          expect(result.counts).toEqual({
            model: 0,
            plan: 0,
            inputParse: 0,
            body: ['P0', 'ROLLBACK'].includes(crash) ? 1 : 0
          })
          const trace = traceMessage.trace as {
            status: string
            response: { mode: string }
            tools: { status: string }[]
          }
          expect(trace.status).toBe(
            ['P0', 'ROLLBACK'].includes(crash) ? 'completed' : 'failed'
          )
          if (!['P0', 'ROLLBACK'].includes(crash)) {
            expect(trace.response.mode).toBe('handoff')
            expect(trace.tools.every((t) => t.status !== 'succeeded')).toBe(
              true
            )
          }
          const closed = (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                'SELECT phase_state,expires_at FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
                [tenantId, f.input.executionId]
              )
            )
          ).rows[0]!
          expect(closed.phase_state).toBe('CLOSED')
          expect(closed.expires_at).toEqual(before.expires_at)
        } finally {
          if (first.child.exitCode === null && first.child.signalCode === null)
            first.child.kill('SIGKILL')
          if (
            second &&
            second.child.exitCode === null &&
            second.child.signalCode === null
          )
            second.child.kill('SIGKILL')
          await first.record()
          if (second) await second.record()
        }
      }, 120000)

    for (const safePoint of ['S1', 'S2'] as const)
      it(`SIGKILL after committed ${safePoint} resumes in a distinct process after real10s expiry without model/plan/input reparse`, async () => {
        const f = await fixture(true)
        await store.admit(f.admission, f.claimed.claimRef)
        const first = await childProcess(
          f,
          `${safePoint.toLowerCase()}-process-a`,
          safePoint,
          true
        )
        let second: Awaited<ReturnType<typeof childProcess>> | undefined
        try {
          const seal = await first.awaitPoint(safePoint)
          expect(seal.counts).toEqual({
            model: 1,
            plan: 1,
            inputParse: 1,
            body: safePoint === 'S1' ? 0 : 1
          })
          const before = (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                'SELECT phase_state,seal_id,state,state_revision,expires_at FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
                [tenantId, f.input.executionId]
              )
            )
          ).rows[0]!
          expect(before.phase_state).toBe('IDLE_SEALED')
          expect(before.state.safePoint).toBe(safePoint)
          expect(first.child.kill('SIGKILL')).toBe(true)
          expect(await first.record()).toEqual({
            code: null,
            signal: 'SIGKILL'
          })
          const clocks = (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                `SELECT clock_timestamp() AS now,e.lease_until AS inner_until,o.lease_until AS outer_until
          FROM operational_executions e JOIN outbox_events o ON o.tenant_id=e.tenant_id
          WHERE e.tenant_id=$1 AND e.id=$2 AND o.id=$3`,
                [tenantId, f.input.executionId, f.claimed.event.id]
              )
            )
          ).rows[0]!
          const delay =
            Math.max(
              new Date(clocks.inner_until).getTime(),
              new Date(clocks.outer_until).getTime()
            ) -
            new Date(clocks.now).getTime() +
            150
          expect(delay).toBeGreaterThan(0)
          expect(delay).toBeLessThanOrEqual(10200)
          await new Promise((resolve) => setTimeout(resolve, delay))
          second = await childProcess(
            f,
            `${safePoint.toLowerCase()}-process-b`,
            safePoint === 'S1' ? 'S2' : undefined
          )
          if (safePoint === 'S1') {
            const progress = async (label: string) => {
              await writeFile(
                resolve(
                  process.env.PARE217_PROCESS_EVIDENCE ?? '/tmp',
                  `stale-progress-${process.pid}.log`
                ),
                `${new Date().toISOString()} ${label}\n`,
                { flag: 'a' }
              )
            }
            await progress('waiting winner S2')
            const liveWinner = await second.awaitPoint('S2')
            await progress('winner S2 observed')
            expect(liveWinner.counts).toEqual({
              model: 0,
              plan: 0,
              inputParse: 0,
              body: 1
            })
            const oldFence = {
              tenantId,
              executionId: f.input.executionId,
              workerId: f.claimed.claimRef.processWorkerId,
              attempt: 1,
              outer: f.claimed.claimRef
            }
            const oldSteps = new PostgresExecutionStepStore(pool, {
              fence: oldFence
            })
            const checkpoint = await oldSteps.loadCheckpoint(
              tenantId,
              f.input.executionId
            )
            const steps = await oldSteps.listSteps(
              tenantId,
              f.input.executionId
            )
            await progress('winner checkpoint and steps read')
            if (!checkpoint || !steps[0])
              throw new Error('Live winner checkpoint/step missing')
            await expect(oldSteps.recordStep(steps[0])).rejects.toMatchObject({
              code: 'lease_lost'
            })
            await progress('old step rejected')
            await expect(
              oldSteps.saveCheckpoint(checkpoint)
            ).rejects.toMatchObject({ code: 'lease_lost' })
            await progress('old checkpoint rejected')
            const oldJournal = new PostgresOperationalEffectJournal(pool, {
              fence: oldFence
            })
            const operationKey = `${f.input.executionId}:s2:find_available_slots`
            const journal = await oldJournal.get(tenantId, operationKey)
            await progress('winner journal read')
            if (!journal)
              throw new Error('Live winner CONFIRMED journal missing')
            await expect(
              oldJournal.reserve({
                tenantId,
                operationKey,
                proposalHash: journal.proposalHash,
                attemptId: journal.attemptId
              })
            ).rejects.toMatchObject({ code: 'lease_lost' })
            await progress('old reserve rejected')
            await expect(
              oldJournal.confirm({
                tenantId,
                operationKey,
                attemptId: journal.attemptId,
                result: { forged: true }
              })
            ).rejects.toMatchObject({ code: 'lease_lost' })
            await progress('old confirm rejected')
            await expect(
              store.renewPaired(f.claimed.claimRef, oldFence, {
                signal: new AbortController().signal,
                assertActive() {}
              })
            ).rejects.toMatchObject({ code: 'lease_lost' })
            await progress('old paired renewal rejected')
            await expect(
              withTenantTransaction(pool, tenantId, async (client) => {
                await client.query(
                  `SELECT set_config('cvg.published_execution',$1,true),set_config('cvg.published_worker',$2,true),
              set_config('cvg.published_attempt','1',true),set_config('cvg.published_mode','active',true)`,
                  [f.input.executionId, oldFence.workerId]
                )
                await client.query(
                  'UPDATE operational_execution_outbox SET attempts=attempts WHERE tenant_id=$1 AND execution_id=$2',
                  [tenantId, f.input.executionId]
                )
              })
            ).rejects.toMatchObject({ code: '42501' })
            await progress('old SQL writer rejected')
            expect(await oldJournal.get(tenantId, operationKey)).toEqual(
              journal
            )
            expect(
              await oldSteps.loadCheckpoint(tenantId, f.input.executionId)
            ).toEqual(checkpoint)
            second.child.stdin.end('continue\n')
            await progress('winner released')
          }
          const result = await second.awaitPoint('RESULT')
          const projected = await second.awaitPoint('TRACE')
          expect(await second.record()).toEqual({ code: 0, signal: null })
          expect(result.pid).not.toBe(seal.pid)
          expect(result.workerId).not.toBe(seal.workerId)
          expect(result.counts).toEqual({
            model: 0,
            plan: 0,
            inputParse: 0,
            body: safePoint === 'S1' ? 1 : 0
          })
          expect(
            (projected.trace as { status: string; tools: unknown[] }).status
          ).toBe('completed')
          expect((projected.trace as { tools: unknown[] }).tools).toEqual([
            { name: 'find_available_slots', status: 'succeeded' }
          ])
          const after = (
            await withTenantContext(pool, tenantId, (c) =>
              c.query(
                'SELECT b.phase_state,b.expires_at,e.attempt,e.state FROM controlled_published_bindings b JOIN operational_executions e ON e.tenant_id=b.tenant_id AND e.id=b.execution_id WHERE b.tenant_id=$1 AND b.execution_id=$2',
                [tenantId, f.input.executionId]
              )
            )
          ).rows[0]!
          expect(after).toMatchObject({
            phase_state: 'CLOSED',
            attempt: 2,
            state: 'SUCCEEDED'
          })
          expect(after.expires_at).toEqual(before.expires_at)
        } finally {
          if (first.child.exitCode === null && first.child.signalCode === null)
            first.child.kill('SIGKILL')
          if (
            second &&
            second.child.exitCode === null &&
            second.child.signalCode === null
          )
            second.child.kill('SIGKILL')
          await first.record()
          if (second) await second.record()
        }
      }, 120000)
  }
)
