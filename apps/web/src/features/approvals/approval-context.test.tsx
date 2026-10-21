/**
 * AUD0621 F22 (SPEC0250 P7, SPEC0114 "Fila de approvals") — two pending
 * approvals with the same action, risk and status but different cases must be
 * distinguishable before a decision, visually and for assistive technology.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApprovalsPanel } from './index.tsx'

const approvals = [
  {
    id: 'approval_case_a',
    sessionId: 'sess_case_a',
    proposedAction: 'create_appointment_draft',
    summary: 'Rascunho para o caso A',
    riskLevel: 'medium',
    status: 'pending',
    createdAt: '2026-10-20T12:00:00.000Z'
  },
  {
    id: 'approval_case_b',
    sessionId: 'sess_case_b',
    proposedAction: 'create_appointment_draft',
    summary: 'Rascunho para o caso B',
    riskLevel: 'medium',
    status: 'pending',
    createdAt: '2026-10-20T12:05:00.000Z'
  }
]

function describedBy(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

describe('ApprovalsPanel decision context (AUD0621 F22)', () => {
  it('P7: shows summary and case for each row and binds them to the decision buttons', () => {
    const onApprove = vi.fn()
    const onOpenCase = vi.fn()
    render(
      <ApprovalsPanel
        approvals={approvals}
        canApproveReject
        onApprove={onApprove}
        openableSessionIds={['sess_case_b']}
        onOpenCase={onOpenCase}
      />
    )

    expect(screen.getByText('Resumo: Rascunho para o caso A')).toBeTruthy()
    expect(screen.getByText('Resumo: Rascunho para o caso B')).toBeTruthy()
    expect(screen.getByText('Caso: sess_case_a')).toBeTruthy()
    expect(screen.getByText('Caso: sess_case_b')).toBeTruthy()
    expect(screen.getAllByText('medium / pending')).toHaveLength(2)

    const approve = screen.getAllByRole('button', {
      name: 'Aprovar create_appointment_draft'
    })
    expect(approve).toHaveLength(2)
    expect(describedBy(approve[0]!)).toContain('Rascunho para o caso A')
    expect(describedBy(approve[0]!)).toContain('sess_case_a')
    expect(describedBy(approve[1]!)).toContain('Rascunho para o caso B')
    expect(describedBy(approve[1]!)).toContain('sess_case_b')
    expect(describedBy(approve[1]!)).not.toContain('sess_case_a')
    for (const name of [
      'Rejeitar create_appointment_draft',
      'Assumir handoff create_appointment_draft'
    ]) {
      const buttons = screen.getAllByRole('button', { name })
      expect(describedBy(buttons[1]!)).toContain('sess_case_b')
    }

    fireEvent.click(approve[1]!)
    expect(onApprove).toHaveBeenCalledWith('approval_case_b')

    expect(
      screen.queryByRole('button', { name: 'Abrir caso sess_case_a' })
    ).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir caso sess_case_b' })
    )
    expect(onOpenCase).toHaveBeenCalledWith('sess_case_b')
  })

  it('P7: flags missing context instead of hiding it', () => {
    render(
      <ApprovalsPanel
        approvals={[
          {
            id: 'approval_legacy',
            proposedAction: 'legacy_action',
            riskLevel: 'low',
            status: 'pending'
          }
        ]}
      />
    )
    expect(screen.getByText('Resumo não informado')).toBeTruthy()
    expect(screen.getByText('Caso não informado')).toBeTruthy()
  })
})
