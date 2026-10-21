export interface PageControlsInfo {
  limit: number
  offset: number
  total: number
  hasNextPage: boolean
}

export interface PageControlsProps {
  /** Plural noun used in the accessible names, e.g. "aprovações". */
  label: string
  pageInfo: PageControlsInfo | null | undefined
  itemCount: number
  disabled?: boolean
  onPrevious?: () => void
  onNext?: () => void
}

/**
 * SPEC0250 §3.6 — bounded listings show their position and move one page at
 * a time. Hidden when everything fits in the first page.
 */
export function PageControls({
  label,
  pageInfo,
  itemCount,
  disabled = false,
  onPrevious,
  onNext
}: PageControlsProps) {
  if (!pageInfo || (pageInfo.offset === 0 && !pageInfo.hasNextPage)) {
    return null
  }
  const first = itemCount > 0 ? pageInfo.offset + 1 : 0
  const last = pageInfo.offset + itemCount
  return (
    <nav className="actions" aria-label={`Paginação de ${label}`}>
      <span>
        {first}–{last} de {pageInfo.total}
      </span>
      <button
        type="button"
        aria-label={`Página anterior de ${label}`}
        disabled={disabled || pageInfo.offset === 0}
        onClick={() => onPrevious?.()}
      >
        Anterior
      </button>
      <button
        type="button"
        aria-label={`Próxima página de ${label}`}
        disabled={disabled || !pageInfo.hasNextPage}
        onClick={() => onNext?.()}
      >
        Próxima
      </button>
    </nav>
  )
}
