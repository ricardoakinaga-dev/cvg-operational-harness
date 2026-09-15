import { describe, expect, it } from 'vitest'
import {
  REDACTED_OUTBOX_ERROR,
  redactSensitiveText,
  sanitizeAuditEvidencePayload,
  sanitizeOutboxError,
  sanitizeOutboxPayload
} from '../audit-governance.ts'

describe('outbox error sanitization', () => {
  it('preserves only bounded machine codes and redacts arbitrary errors', () => {
    expect(sanitizeOutboxError({ code: 'dead_letter' })).toBe(
      'outbox_error:dead_letter'
    )
    expect(sanitizeOutboxError({ code: 'retry_after_lease' })).toBe(
      'outbox_error:retry_after_lease'
    )
    expect(sanitizeOutboxError({ code: 'INVALID CODE' })).toBe(
      REDACTED_OUTBOX_ERROR
    )
    expect(sanitizeOutboxError({ code: 42 })).toBe(REDACTED_OUTBOX_ERROR)
    expect(sanitizeOutboxError(new Error('boom with detail'))).toBe(
      REDACTED_OUTBOX_ERROR
    )
    expect(sanitizeOutboxError(null)).toBe(REDACTED_OUTBOX_ERROR)
    expect(sanitizeOutboxError('raw')).toBe(REDACTED_OUTBOX_ERROR)
  })
})

describe('audit evidence payload sanitization', () => {
  it('drops sensitive keys, marks their paths and keeps primitives intact', () => {
    const result = sanitizeAuditEvidencePayload({
      safe: 'ok',
      patientName: 'Ana',
      nested: { email: 'ana@example.com', token: 'fixture-token' },
      items: [{ phone: '+55 11 99999-9999' }, 'plain'],
      count: 3,
      flag: true,
      empty: null
    })

    expect(result.payload).toEqual({
      safe: 'ok',
      nested: {},
      items: [{}, 'plain'],
      count: 3,
      flag: true,
      empty: null
    })
    expect(result.redactedFields).toEqual(
      expect.arrayContaining([
        'patientName',
        'nested.email',
        'nested.token',
        'items.0.phone'
      ])
    )
    expect(JSON.stringify(result.payload)).not.toContain('Ana')
    expect(JSON.stringify(result.payload)).not.toContain('fixture-token')
  })

  it('redacts free text and records the redacted path', () => {
    const result = sanitizeAuditEvidencePayload({
      note: 'contato ana@example.com',
      plain: 'sem alteracoes'
    })

    expect(result.payload).toEqual({
      note: 'contato [redacted-email]',
      plain: 'sem alteracoes'
    })
    expect(result.redactedFields).toEqual(['note'])
  })

  it('keeps root arrays, primitives and null unchanged', () => {
    expect(sanitizeAuditEvidencePayload(['plain', 7]).payload).toEqual([
      'plain',
      7
    ])
    expect(sanitizeAuditEvidencePayload('texto livre').payload).toBe(
      'texto livre'
    )
    expect(sanitizeAuditEvidencePayload(null).payload).toBeNull()
  })
})

describe('free text redaction patterns', () => {
  it('redacts emails, CPF, CNPJ, addresses, names, birth dates and phones', () => {
    expect(redactSensitiveText('contato ana@example.com agora')).toBe(
      'contato [redacted-email] agora'
    )
    expect(redactSensitiveText('cpf 123.456.789-09')).toBe('cpf [redacted-cpf]')
    expect(redactSensitiveText('cnpj 12.345.678/0001-90')).toBe(
      'cnpj [redacted-cnpj]'
    )
    expect(redactSensitiveText('Rua das Flores, 100')).toBe(
      '[redacted-address]'
    )
    expect(redactSensitiveText('meu nome é Ana Paula Souza')).toBe(
      'meu nome é [redacted-name]'
    )
    expect(redactSensitiveText('nascido em 01/02/1990')).toBe(
      '[redacted-birth-date]'
    )
    expect(redactSensitiveText('telefone +55 11 99999-9999')).toBe(
      'telefone [redacted-phone]'
    )
  })

  it('redacts secrets while preserving UUID-shaped values', () => {
    expect(redactSensitiveText('authorization: Bearer live-secret')).toBe(
      '[redacted-secret]'
    )
    expect(redactSensitiveText('api_key=sk-live-looking')).toBe(
      '[redacted-secret]'
    )
    expect(redactSensitiveText('Bearer opaque-token')).toBe(
      'Bearer [redacted-secret]'
    )
    const uuid = '00000000-0000-4000-8000-000000000001'
    expect(redactSensitiveText(`ref ${uuid}`)).toBe(`ref ${uuid}`)
  })
})

describe('outbox payload sanitization', () => {
  it('preserves stable correlation identifiers and placeholders the rest', () => {
    const payload = {
      tenantId: 'tenant_00000000-0000-4000-8000-000000000001',
      agentId: 'agent_00000000-0000-4000-8000-000000000002',
      agentVersionId: 'agent_version_00000000-0000-4000-8000-000000000003',
      conversationId: 'conv_00000000-0000-4000-8000-000000000004',
      correlationId: 'corr_00000000-0000-4000-8000-000000000005',
      sessionId: 'sess_00000000-0000-4000-8000-000000000006',
      messageId: 'msg_00000000-0000-4000-8000-000000000007',
      inboundMessageId: 'inbound_00000000-0000-4000-8000-000000000008',
      eventId: 'event_00000000-0000-4000-8000-000000000009',
      type: 'inbound.process',
      eventType: 'message.outbound',
      channel: 'web',
      policy: 'outbox-r7',
      body: 'conteudo bruto',
      externalMessageId: 'provider-message-1',
      senderRef: 'sender-1',
      apiKey: 'sk-live',
      accessToken: 'fixture-token',
      clientSecret: 'fixture-secret',
      privateKey: 'fixture-key',
      credential: 'fixture-credential',
      password: 'fixture-password',
      authorization: 'Bearer fixture-auth',
      plainText: 'texto livre',
      count: 42,
      enabled: true,
      empty: null,
      nested: { content: 'dentro' },
      list: ['texto', 7]
    }

    const result = sanitizeOutboxPayload(payload)

    expect(result.payload).toMatchObject({
      tenantId: payload.tenantId,
      agentId: payload.agentId,
      agentVersionId: payload.agentVersionId,
      conversationId: payload.conversationId,
      correlationId: payload.correlationId,
      sessionId: payload.sessionId,
      messageId: payload.messageId,
      inboundMessageId: payload.inboundMessageId,
      eventId: payload.eventId,
      type: 'inbound.process',
      eventType: 'message.outbound',
      channel: 'web',
      policy: 'outbox-r7',
      body: '[redacted-outbox-body]',
      externalMessageId: '[redacted-external-message-id]',
      senderRef: '[redacted-sender-ref]',
      apiKey: '[redacted-secret]',
      accessToken: '[redacted-secret]',
      clientSecret: '[redacted-secret]',
      privateKey: '[redacted-secret]',
      credential: '[redacted-secret]',
      password: '[redacted-secret]',
      authorization: '[redacted-secret]',
      plainText: '[redacted-outbox-text]',
      count: '[redacted-outbox-number]',
      enabled: true,
      empty: null,
      nested: { content: '[redacted-outbox-text]' },
      list: ['[redacted-outbox-text]', '[redacted-outbox-number]']
    })
    expect(result.redactedFields).toEqual(
      expect.arrayContaining([
        'body',
        'externalMessageId',
        'senderRef',
        'apiKey',
        'plainText',
        'count',
        'nested.content',
        'list.0',
        'list.1'
      ])
    )
  })

  it('redacts invalid identifier values and PII keys with typed placeholders', () => {
    const result = sanitizeOutboxPayload({
      tenantId: 'not-a-tenant',
      correlationId: 'bad-corr',
      channel: 'sms',
      policy: 'policy-r1',
      type: 'Invalid Type',
      sessionId: 'sess_bad',
      conversationId: 'conv_bad',
      eventId: 'bad',
      cpf: '123.456.789-09',
      cnpj: '12.345.678/0001-90',
      diagnosis: 'fixture',
      medicalRecord: 'fixture',
      prescription: 'fixture',
      symptoms: 'fixture',
      document: 'fixture',
      documentId: 'fixture',
      email: 'ana@example.com',
      birthDate: '1990-01-02',
      address: 'Rua das Flores',
      phone: '+55 11 99999-9999',
      name: 'Ana',
      patientName: 'Ana',
      homeAddress: 'Rua das Flores',
      dateOfBirth: '1990-01-02',
      secretBox: 'hidden',
      note: 'texto livre',
      flag: false,
      tags: ['livre'],
      counter: 7
    })

    expect(result.payload).toMatchObject({
      tenantId: '[redacted-outbox-text]',
      correlationId: '[redacted-outbox-text]',
      channel: '[redacted-outbox-text]',
      policy: '[redacted-outbox-text]',
      type: '[redacted-outbox-text]',
      sessionId: '[redacted-outbox-text]',
      conversationId: '[redacted-outbox-text]',
      eventId: '[redacted-outbox-text]',
      cpf: '[redacted-cpf]',
      cnpj: '[redacted-cnpj]',
      diagnosis: '[redacted-diagnosis]',
      medicalRecord: '[redacted-medical-record]',
      prescription: '[redacted-prescription]',
      symptoms: '[redacted-symptoms]',
      document: '[redacted-document]',
      documentId: '[redacted-document]',
      email: '[redacted-email]',
      birthDate: '[redacted-birth-date]',
      address: '[redacted-address]',
      phone: '[redacted-phone]',
      name: '[redacted-name]',
      patientName: '[redacted-name]',
      homeAddress: '[redacted-address]',
      dateOfBirth: '[redacted-birth-date]',
      secretBox: '[redacted-secret]',
      note: '[redacted-outbox-text]',
      flag: false,
      tags: ['[redacted-outbox-text]'],
      counter: '[redacted-outbox-number]'
    })
  })

  it('handles array and primitive roots without leaking values', () => {
    expect(sanitizeOutboxPayload(['livre', 5, true, null]).payload).toEqual([
      '[redacted-outbox-text]',
      '[redacted-outbox-number]',
      true,
      null
    ])
    expect(sanitizeOutboxPayload('livre').payload).toBe(
      '[redacted-outbox-text]'
    )
    expect(sanitizeOutboxPayload(null).payload).toBeNull()
  })
})
