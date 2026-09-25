import type { PlatformTraceView } from '../../api/client.ts'
import { traceText } from './draft-helpers.ts'

interface TraceViewerProps {
  items: readonly PlatformTraceView[]
  onSelect: (trace: PlatformTraceView) => void
}

export function TraceViewer({ items, onSelect }: TraceViewerProps) {
  return (
    <section
      className="platformTraceViewer"
      id="platform-traces"
      aria-label="Trace Viewer"
    >
      <div className="panelHeader">
        <div>
          <h3>Trace Viewer</h3>
          <p>Execuções persistidas, redigidas e tenant-scoped.</p>
        </div>
        <span className="status">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p>Nenhuma trace persistida.</p>
      ) : (
        <div className="platformTraceList">
          {items.map((item) => (
            <button
              className="row rowButton"
              key={item.traceId}
              type="button"
              onClick={() => onSelect(item)}
            >
              <strong>{traceText(item.executionMode)}</strong>
              <span>{traceText(item.traceId)}</span>
              <span>{traceText(item.configVersion)}</span>
              <span>
                {item.tools.length > 0
                  ? item.tools
                      .map(
                        (tool) =>
                          `${traceText(tool.name)}: ${traceText(tool.status)}`
                      )
                      .join(', ')
                  : 'sem tools'}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
