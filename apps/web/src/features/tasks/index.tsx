import { PageControls, type PageControlsInfo } from '../page-controls.tsx'

export interface TasksPanelProps {
  /** SPEC0251 §4.4: status line, e.g. an item no longer available. */
  message?: string | null
  tasks: Array<{ id: string; title: string; priority: string; status: string }>
  error?: string | null
  isLoading?: boolean
  actionId?: string | null
  canUpdateTasks?: boolean
  onStart?: (taskId: string) => void
  onComplete?: (taskId: string) => void
  onCancel?: (taskId: string) => void
  pageInfo?: PageControlsInfo | null
  onPreviousPage?: () => void
  onNextPage?: () => void
}

export function TasksPanel({
  message = null,
  tasks,
  error = null,
  isLoading = false,
  actionId = null,
  canUpdateTasks = false,
  onStart,
  onComplete,
  onCancel,
  pageInfo = null,
  onPreviousPage,
  onNextPage
}: TasksPanelProps) {
  return (
    <section className="panel" aria-labelledby="tasks-title">
      <header className="panelHeader">
        <h2 id="tasks-title">Tarefas</h2>
        <span className="counter">{pageInfo?.total ?? tasks.length}</span>
      </header>
      <div className="list">
        {message ? <p role="status">{message}</p> : null}
        {isLoading ? (
          <p className="state" role="status">
            Carregando...
          </p>
        ) : null}
        {!isLoading && error ? (
          <p className="state stateError" role="alert">
            {error}
          </p>
        ) : null}
        {!isLoading && !error && tasks.length === 0 ? (
          <p className="state">Nenhuma tarefa interna.</p>
        ) : null}
        {!isLoading && !error
          ? tasks.map((task) => {
              const isActing = actionId === task.id
              const canStart = task.status === 'open'
              const canComplete =
                task.status === 'open' || task.status === 'in_progress'
              const canCancel =
                task.status === 'open' || task.status === 'in_progress'
              return (
                <article className="row" key={task.id}>
                  <strong>{task.title}</strong>
                  <span>
                    {task.priority} / {task.status}
                  </span>
                  {canStart || canComplete || canCancel ? (
                    <div className="actions" aria-label={`Acoes ${task.title}`}>
                      {canStart ? (
                        <button
                          type="button"
                          aria-label={`Iniciar ${task.title}`}
                          disabled={isActing || !canUpdateTasks}
                          onClick={() => onStart?.(task.id)}
                        >
                          Iniciar
                        </button>
                      ) : null}
                      {canComplete ? (
                        <button
                          type="button"
                          aria-label={`Concluir ${task.title}`}
                          disabled={isActing || !canUpdateTasks}
                          onClick={() => onComplete?.(task.id)}
                        >
                          Concluir
                        </button>
                      ) : null}
                      {canCancel ? (
                        <button
                          type="button"
                          aria-label={`Cancelar ${task.title}`}
                          disabled={isActing || !canUpdateTasks}
                          onClick={() => onCancel?.(task.id)}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              )
            })
          : null}
        {!error ? (
          <PageControls
            label="tarefas"
            pageInfo={pageInfo}
            itemCount={tasks.length}
            disabled={isLoading}
            {...(onPreviousPage ? { onPrevious: onPreviousPage } : {})}
            {...(onNextPage ? { onNext: onNextPage } : {})}
          />
        ) : null}
      </div>
    </section>
  )
}
