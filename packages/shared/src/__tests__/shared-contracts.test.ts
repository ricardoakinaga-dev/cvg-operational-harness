import { describe, expect, it } from 'vitest'
import {
  CreateInternalTaskSchema,
  DomainError,
  DomainIdSchema,
  ReceiveInboundMessageSchema,
  auditEvidenceGovernance,
  createCorrelationId,
  createDomainId,
  fail,
  ok,
  parseEnv,
  parseOperatorIdentity,
  createRealCapabilityGuards,
  requirePermission,
  redactSensitiveText,
  sanitizeAuditEvidencePayload,
  sanitizeOutboxPayload,
  roleHasPermission,
  toSafeError,
  withCorrelation
} from '../index.ts'

describe('shared contracts', () => {
  it('creates strongly typed domain and correlation identifiers', () => {
    expect(DomainIdSchema.safeParse(createDomainId('conv')).success).toBe(true)
    expect(createCorrelationId()).toMatch(/^corr_[0-9a-f-]{36}$/)
  })

  it('wraps success and failure responses in a stable API envelope', () => {
    const correlationId = createCorrelationId()

    expect(ok({ status: 'ok' }, correlationId)).toEqual({
      success: true,
      data: { status: 'ok' },
      error: null,
      meta: { correlationId }
    })
    expect(fail('forbidden', 'No access', correlationId)).toEqual({
      success: false,
      data: null,
      error: { code: 'forbidden', message: 'No access' },
      meta: { correlationId }
    })
  })

  it('adds correlation ids to structured runtime values', () => {
    const correlationId = createCorrelationId()
    expect(
      withCorrelation({ event: 'task.status_changed' }, correlationId)
    ).toEqual({
      event: 'task.status_changed',
      correlationId
    })
  })

  it('validates application command schemas at system boundaries', () => {
    expect(
      ReceiveInboundMessageSchema.parse({
        tenantId: 'tenant_00000000-0000-4000-8000-000000000080',
        channel: 'whatsapp',
        externalMessageId: 'msg-1',
        senderRef: '+5511999999999',
        body: 'Ola',
        receivedAt: '2026-04-29T10:00:00-03:00'
      }).receivedAt
    ).toBeInstanceOf(Date)

    expect(() =>
      CreateInternalTaskSchema.parse({
        sessionId: 'sess_1',
        title: 'Retorno',
        description: 'Ligar para tutor',
        priority: 'invalid',
        source: 'agent',
        idempotencyKey: 'task-key-1'
      })
    ).toThrow()
    expect(() =>
      ReceiveInboundMessageSchema.parse({
        tenantId: 'tenant_00000000-0000-4000-8000-000000000080',
        channel: 'web',
        externalMessageId: 'msg-2',
        senderRef: 'fixture-sender',
        body: 'Continuação',
        receivedAt: '2026-04-29T10:00:00-03:00',
        conversationId: 'conv_00000000-0000-4000-8000-000000000080'
      })
    ).toThrow()
  })

  it('keeps RBAC least-privilege checks explicit', () => {
    expect(roleHasPermission('Approver', 'approval:decide')).toBe(true)
    expect(roleHasPermission('Operator', 'approval:decide')).toBe(false)
    expect(() => requirePermission('Operator', 'approval:decide')).toThrow(
      /cannot perform/
    )
  })

  it('validates controlled operator identity from runtime headers', () => {
    expect(
      parseOperatorIdentity({
        'x-operator-id': 'operator.shift-a',
        'x-operator-role': 'Operator',
        'x-tenant-id': 'tenant_00000000-0000-4000-8000-000000000001'
      })
    ).toEqual({
      operatorId: 'operator.shift-a',
      role: 'Operator',
      tenantId: 'tenant_00000000-0000-4000-8000-000000000001'
    })

    expect(() =>
      parseOperatorIdentity({
        'x-operator-id': '',
        'x-operator-role': 'Operator'
      })
    ).toThrow()
    expect(() =>
      parseOperatorIdentity({
        'x-operator-id': 'operator.shift-a',
        'x-operator-role': 'System'
      })
    ).toThrow()
    expect(() =>
      parseOperatorIdentity({
        'x-operator-id': 'operator shift a',
        'x-operator-role': 'Operator'
      })
    ).toThrow()
  })

  it('parses environment and disables real world actions by default', () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'https://database.local/cvg',
      OPENAI_API_KEY: 'test',
      ENABLE_REAL_CHANNELS: 'false',
      ENABLE_REAL_RAG: 'false',
      ENABLE_REAL_PAYMENTS: 'false',
      ENABLE_REAL_MEDICAL_RECORDS: 'false',
      POSTGRES_RLS_ENFORCEMENT: 'false'
    } as NodeJS.ProcessEnv)

    const guards = createRealCapabilityGuards({ env })
    expect(guards.channels.open).toBe(false)
    expect(guards.rag.open).toBe(false)
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'https://database.local/cvg',
        OPENAI_API_KEY: 'replace_me',
        ENABLE_REAL_CHANNELS: 'false',
        ENABLE_REAL_RAG: 'false',
        ENABLE_REAL_PAYMENTS: 'false',
        ENABLE_REAL_MEDICAL_RECORDS: 'false',
        POSTGRES_RLS_ENFORCEMENT: 'false'
      } as NodeJS.ProcessEnv)
    ).toThrow(/production provider secret/)
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'https://database.local/cvg',
        OPENAI_API_KEY: 'configured-provider',
        WEBHOOK_SIGNING_SECRET:
          'test-production-webhook-signing-secret-32-chars',
        ENABLE_REAL_CHANNELS: 'false',
        ENABLE_REAL_RAG: 'false',
        ENABLE_REAL_PAYMENTS: 'false',
        ENABLE_REAL_MEDICAL_RECORDS: 'false',
        POSTGRES_RLS_ENFORCEMENT: 'false'
      } as NodeJS.ProcessEnv)
    ).toThrow(/tenant-scoped PostgreSQL RLS enforcement/)

    const productionEnv = parseEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'https://database.local/cvg',
      OPENAI_API_KEY: 'configured-provider',
      WEBHOOK_SIGNING_SECRET:
        'production-signing-secret-that-is-long-enough-2026',
      INBOUND_TENANT_ID: 'tenant_00000000-0000-4000-8000-000000000001',
      INBOUND_AGENT_ID: 'agent_00000000-0000-4000-8000-000000000001',
      API_ALLOWED_ORIGINS: 'https://console.example.test',
      API_REQUIRE_HTTPS: 'true',
      API_TRUSTED_PROXY_HOPS: '0',
      ENABLE_REAL_CHANNELS: 'false',
      ENABLE_REAL_RAG: 'false',
      ENABLE_REAL_PAYMENTS: 'false',
      ENABLE_REAL_MEDICAL_RECORDS: 'false',
      POSTGRES_RLS_ENFORCEMENT: 'true'
    } as NodeJS.ProcessEnv)
    expect(productionEnv.INBOUND_TENANT_ID).toBe(
      'tenant_00000000-0000-4000-8000-000000000001'
    )
    expect(productionEnv.INBOUND_AGENT_ID).toBe(
      'agent_00000000-0000-4000-8000-000000000001'
    )
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'https://database.local/cvg',
        OPENAI_API_KEY: 'configured-provider',
        WEBHOOK_SIGNING_SECRET:
          'production-signing-secret-that-is-long-enough-2026',
        INBOUND_TENANT_ID: 'tenant_invalid',
        INBOUND_AGENT_ID: 'agent_00000000-0000-4000-8000-000000000001',
        API_ALLOWED_ORIGINS: 'https://console.example.test',
        API_REQUIRE_HTTPS: 'true',
        API_TRUSTED_PROXY_HOPS: '0',
        ENABLE_REAL_CHANNELS: 'false',
        ENABLE_REAL_RAG: 'false',
        ENABLE_REAL_PAYMENTS: 'false',
        ENABLE_REAL_MEDICAL_RECORDS: 'false',
        POSTGRES_RLS_ENFORCEMENT: 'true'
      } as NodeJS.ProcessEnv)
    ).toThrow(/INBOUND_TENANT_ID/)
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'https://database.local/cvg',
        OPENAI_API_KEY: 'configured-provider',
        WEBHOOK_SIGNING_SECRET:
          'production-signing-secret-that-is-long-enough-2026',
        INBOUND_TENANT_ID: 'tenant_00000000-0000-4000-8000-000000000001',
        INBOUND_AGENT_ID: 'agent_invalid',
        API_ALLOWED_ORIGINS: 'https://console.example.test',
        API_REQUIRE_HTTPS: 'true',
        API_TRUSTED_PROXY_HOPS: '0',
        ENABLE_REAL_CHANNELS: 'false',
        ENABLE_REAL_RAG: 'false',
        ENABLE_REAL_PAYMENTS: 'false',
        ENABLE_REAL_MEDICAL_RECORDS: 'false',
        POSTGRES_RLS_ENFORCEMENT: 'true'
      } as NodeJS.ProcessEnv)
    ).toThrow(/INBOUND_AGENT_ID/)
  })

  it('returns safe external errors without leaking internals', () => {
    expect(
      toSafeError(new DomainError('empty_body', 'Message body is required'))
    ).toEqual({
      code: 'empty_body',
      message: 'Message body is required'
    })
    expect(toSafeError(new Error('database password leaked'))).toEqual({
      code: 'internal_error',
      message: 'Unexpected internal error'
    })
  })

  it('minimizes audit evidence payloads and declares retention governance', () => {
    const sanitized = sanitizeAuditEvidencePayload({
      sessionId: 'sess_1',
      effect: 'approval_state_only',
      token: 'secret-token',
      accessToken: 'secret-access-token',
      clientSecret: 'secret-client-value',
      body: 'Mensagem pessoal ficticia',
      email: 'paciente@example.invalid',
      cpf: '11122233344',
      patientName: 'Paciente Ficticio',
      phone: '+5511999999999',
      contactAddress: 'Rua Ficticia, 123',
      nested: {
        authorization: 'Bearer secret',
        safeStatus: 'ok'
      }
    })

    expect(sanitized.payload).toEqual({
      sessionId: 'sess_1',
      effect: 'approval_state_only',
      nested: {
        safeStatus: 'ok'
      }
    })
    expect(sanitized.redactedFields).toEqual([
      'token',
      'accessToken',
      'clientSecret',
      'body',
      'email',
      'cpf',
      'patientName',
      'phone',
      'contactAddress',
      'nested.authorization'
    ])

    const freeText = sanitizeAuditEvidencePayload({
      note: 'Contato fictício: ana@example.com, +5511999999999 e 123-456-789-01'
    })
    expect(freeText.payload).toEqual({
      note: 'Contato fictício: [redacted-email], [redacted-phone] e [redacted-phone]'
    })
    expect(freeText.redactedFields).toEqual(['note'])
    expect(
      redactSensitiveText('sess_00000000-0000-4000-8000-000000000001')
    ).toBe('sess_00000000-0000-4000-8000-000000000001')

    expect(auditEvidenceGovernance).toMatchObject({
      retention: {
        policyId: 'controlled-construction-audit-retention-v1',
        approvedForRealData: false,
        humanSignoffRequired: true
      },
      export: {
        externalDispatch: false,
        externalExportRequiresApproval: true
      }
    })
  })

  it('keeps durable envelopes correlatable without persisting inbound content', () => {
    const sanitized = sanitizeOutboxPayload({
      tenantId: 'tenant_00000000-0000-4000-8000-000000000174',
      conversationId: 'conv_00000000-0000-4000-8000-000000000174',
      senderRef: 'fixture-sender',
      externalMessageId: 'external-message-fixture',
      body: 'Meu nome é Ana e meu telefone é +5511999999999.',
      metadata: {
        accessToken: 'fixture-secret',
        status: 'Paciente Ana tem diagnóstico de asma'
      }
    })

    expect(sanitized.payload).toEqual({
      tenantId: 'tenant_00000000-0000-4000-8000-000000000174',
      conversationId: 'conv_00000000-0000-4000-8000-000000000174',
      senderRef: '[redacted-sender-ref]',
      externalMessageId: '[redacted-external-message-id]',
      body: '[redacted-outbox-body]',
      metadata: {
        accessToken: '[redacted-secret]',
        status: '[redacted-outbox-text]'
      }
    })
    expect(sanitized.redactedFields).toEqual([
      'senderRef',
      'externalMessageId',
      'body',
      'metadata.accessToken',
      'metadata.status'
    ])
  })

  it('turns mixed clinical, identity and secret free text into an opaque marker', () => {
    const sanitized = sanitizeOutboxPayload({
      body: 'Diagnóstico: asma; paciente: Ana Silva; email ana@example.test; token=secret-fixture',
      result: {
        text: 'Consulta sobre hipertensão para João Silva',
        status: 'controlled'
      },
      fixture: 'Paciente Ana tem diagnóstico de asma',
      correlationId: 'corr_00000000-0000-4000-8000-000000000174'
    })

    expect(sanitized.payload).toEqual({
      body: '[redacted-outbox-body]',
      result: {
        text: '[redacted-outbox-text]',
        status: '[redacted-outbox-text]'
      },
      fixture: '[redacted-outbox-text]',
      correlationId: 'corr_00000000-0000-4000-8000-000000000174'
    })
    expect(JSON.stringify(sanitized.payload)).not.toContain('asma')
    expect(JSON.stringify(sanitized.payload)).not.toContain('Ana Silva')
    expect(JSON.stringify(sanitized.payload)).not.toContain('secret-fixture')
  })
})
