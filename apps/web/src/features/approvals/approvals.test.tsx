// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApprovalsPanel } from './index.tsx'

describe('ApprovalsPanel', () => {
  it('renders pending approvals and submits controlled decisions', () => {
    const onApprove = vi.fn()
    render(
      <ApprovalsPanel
        approvals={[
          {
            id: 'approval_1',
            proposedAction: 'create_appointment_draft',
            riskLevel: 'medium',
            status: 'pending'
          }
        ]}
        canApproveReject
        onApprove={onApprove}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }))

    expect(screen.getByText('create_appointment_draft')).toBeTruthy()
    expect(onApprove).toHaveBeenCalledWith('approval_1')
  })
})
