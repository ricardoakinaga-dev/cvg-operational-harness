// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuditPanel } from './index.tsx'

describe('AuditPanel checkpoint controls', () => {
  it('exposes seal and archive actions for the loaded metadata page', () => {
    render(
      <AuditPanel
        canReviewEvidence
        events={[
          {
            id: 'audit_00000000-0000-4000-8000-000000000001',
            type: 'integration_event',
            actorType: 'System'
          }
        ]}
        evidence={null}
        checkpoint={null}
        canManageEvidenceCheckpoint
        onSealEvidenceCheckpoint={() => undefined}
        onArchiveEvidenceCheckpoint={() => undefined}
      />
    )

    expect(
      screen.getByRole('button', { name: 'Selar checkpoint' })
    ).toBeTruthy()
    expect(screen.getByText('Checkpoint de evidencia')).toBeTruthy()
  })
})
