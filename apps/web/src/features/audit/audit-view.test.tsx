// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuditPanel } from './index.tsx'

describe('AuditPanel', () => {
  it('renders audit trail and controlled evidence review metadata', () => {
    render(
      <AuditPanel
        canReviewEvidence
        events={[
          { id: 'audit_1', type: 'integration_event', actorType: 'System' }
        ]}
        evidence={{
          summary: {
            totalEvents: 1,
            byType: { integration_event: 1 },
            byActorType: { System: 1 }
          },
          page: {
            items: [
              {
                id: 'audit_1',
                type: 'integration_event',
                actorType: 'System',
                correlationId: 'corr_00000000-0000-4000-8000-000000000001'
              }
            ],
            pageInfo: {
              limit: 10,
              offset: 0,
              total: 1,
              hasNextPage: false
            }
          },
          export: {
            format: 'json',
            controlled: true,
            externalDispatch: false,
            requestedBy: 'supervisor.audit'
          }
        }}
      />
    )

    expect(screen.getAllByText('integration_event')).toHaveLength(2)
    expect(screen.getByText('Evidencias 1-1 de 1')).toBeTruthy()
    expect(screen.getByText('Sem despacho externo')).toBeTruthy()
  })
})
