// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TasksPanel } from './index.tsx'

describe('TasksPanel', () => {
  it('renders task lifecycle controls without external side effects', () => {
    const onStart = vi.fn()
    render(
      <TasksPanel
        canUpdateTasks
        onStart={onStart}
        tasks={[
          {
            id: 'task_1',
            title: 'Retorno',
            priority: 'high',
            status: 'open'
          }
        ]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Retorno' }))

    expect(screen.getByText('high / open')).toBeTruthy()
    expect(onStart).toHaveBeenCalledWith('task_1')
  })
})
