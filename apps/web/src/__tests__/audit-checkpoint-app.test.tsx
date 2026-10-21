import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../App.tsx'

function envelope<T>(data: T) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: true, data, error: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  )
}

describe('App audit evidence checkpoint flow', () => {
  it('seals the loaded evidence page and archives it with CAS', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/conversations?limit=25&offset=0') {
        return envelope({
          items: [
            {
              id: 'conv_checkpoint_1',
              channel: 'whatsapp',
              senderRef: 'fixture',
              status: 'active',
              correlationId: 'corr_00000000-0000-4000-8000-000000000201',
              openSessionId: 'sess_00000000-0000-4000-8000-000000000201',
              lastMessageBody: 'Fixture',
              lastMessageAt: '2026-08-25T10:00:00.000Z',
              updatedAt: '2026-08-25T10:00:00.000Z'
            }
          ],
          pageInfo: { limit: 25, offset: 0, total: 1, hasNextPage: false }
        })
      }
      if (url === '/v1/conversations/conv_checkpoint_1/timeline') {
        return envelope({ messages: [] })
      }
      if (url === '/v1/approvals?status=pending&limit=25&offset=0')
        return envelope([])
      if (url === '/v1/tasks?status=open,in_progress&limit=25&offset=0')
        return envelope([])
      if (
        url === '/v1/audit/sessions/sess_00000000-0000-4000-8000-000000000201'
      ) {
        return envelope({
          events: [
            {
              id: 'audit_00000000-0000-4000-8000-000000000201',
              type: 'integration_event',
              actorType: 'System',
              createdAt: '2026-08-25T10:00:00.000Z'
            }
          ]
        })
      }
      if (
        url ===
        '/v1/observability/audit-evidence?sessionId=sess_00000000-0000-4000-8000-000000000201&limit=10&offset=0'
      ) {
        return envelope({
          summary: {
            totalEvents: 1,
            byType: { integration_event: 1 },
            byActorType: { System: 1 },
            byCorrelationId: {
              'corr_00000000-0000-4000-8000-000000000201': 1
            },
            bySessionId: {
              'sess_00000000-0000-4000-8000-000000000201': 1
            }
          },
          page: {
            items: [
              {
                id: 'audit_00000000-0000-4000-8000-000000000201',
                type: 'integration_event',
                actorType: 'System',
                correlationId: 'corr_00000000-0000-4000-8000-000000000201',
                createdAt: '2026-08-25T10:00:00.000Z'
              }
            ],
            pageInfo: { limit: 10, offset: 0, total: 1, hasNextPage: false }
          },
          export: {
            format: 'json',
            controlled: true,
            externalDispatch: false,
            requestedBy: 'supervisor.app'
          }
        })
      }
      if (url === '/v1/observability/audit-evidence/checkpoints') {
        if (init?.method === 'POST') {
          return envelope({
            checkpoint: {
              id: 'audit_checkpoint_00000000-0000-4000-8000-000000000201',
              tenantId: 'tenant_00000000-0000-4000-8000-000000000201',
              filters: {
                sessionId: 'sess_00000000-0000-4000-8000-000000000201'
              },
              eventIds: ['audit_00000000-0000-4000-8000-000000000201'],
              eventCount: 1,
              evidenceDigest: 'c'.repeat(64),
              status: 'SEALED',
              createdBy: 'supervisor.app',
              updatedBy: 'supervisor.app',
              createdAt: '2026-08-25T10:00:00.000Z',
              updatedAt: '2026-08-25T10:00:00.000Z'
            }
          })
        }
        return envelope({ checkpoints: [] })
      }
      if (
        url ===
        '/v1/observability/audit-evidence/checkpoints/audit_checkpoint_00000000-0000-4000-8000-000000000201/transition'
      ) {
        return envelope({
          checkpoint: {
            id: 'audit_checkpoint_00000000-0000-4000-8000-000000000201',
            tenantId: 'tenant_00000000-0000-4000-8000-000000000201',
            filters: {
              sessionId: 'sess_00000000-0000-4000-8000-000000000201'
            },
            eventIds: ['audit_00000000-0000-4000-8000-000000000201'],
            eventCount: 1,
            evidenceDigest: 'c'.repeat(64),
            status: 'ARCHIVED',
            createdBy: 'supervisor.app',
            updatedBy: 'supervisor.app',
            createdAt: '2026-08-25T10:00:00.000Z',
            updatedAt: '2026-08-25T10:00:01.000Z'
          }
        })
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText('ID do operador'), {
      target: { value: 'supervisor.app' }
    })
    fireEvent.change(screen.getByLabelText('Papel operacional'), {
      target: { value: 'Supervisor' }
    })

    const sealButton = await screen.findByRole('button', {
      name: 'Selar checkpoint'
    })
    await waitFor(() => expect(sealButton.getAttribute('disabled')).toBeNull())
    fireEvent.click(sealButton)
    expect(
      await screen.findByText(
        'Checkpoint selado com IDs e digest; nenhum payload foi persistido.'
      )
    ).toBeTruthy()
    expect(await screen.findByText('1 eventos / SEALED')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Arquivar checkpoint' }))
    expect(
      await screen.findByText('Checkpoint arquivado com CAS.')
    ).toBeTruthy()
    expect(await screen.findByText('1 eventos / ARCHIVED')).toBeTruthy()
  })
})
