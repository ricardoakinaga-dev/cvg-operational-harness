export type Command =
  | { type: 'list' }
  | { type: 'done'; number: number }
  | { type: 'snooze'; number: number; minutes: number }
  | { type: 'confirm' }
  | { type: 'correct'; text: string }
  | { type: 'help' }
  | { type: 'pause' }
  | { type: 'resume' }

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Deterministic commands. Anything that is not exactly a command is a note,
 * so a sentence that merely starts with "ok" is never swallowed.
 */
export function parseCommand(text: string): Command | undefined {
  const folded = fold(text).replace(/\s+/g, ' ')
  if (/^(minhas )?pendencias\??$|^lista$/.test(folded)) return { type: 'list' }
  if (/^(ajuda|menu|\?)$/.test(folded)) return { type: 'help' }
  if (/^(ok|confirmo|confirmado)[.!]?$/.test(folded)) return { type: 'confirm' }
  if (folded === 'pausar assistente') return { type: 'pause' }
  if (folded === 'retomar assistente') return { type: 'resume' }

  const done = /^(feito|concluido|ok) #?(\d{1,6})$/.exec(folded)
  if (done) return { type: 'done', number: Number(done[2]) }

  const snooze =
    /^adiar #?(\d{1,6}) (\d{1,4}) ?(m|min|mins|minutos?|h|hs|horas?)?$/.exec(
      folded
    )
  if (snooze) {
    const amount = Number(snooze[2])
    const unit = snooze[3] ?? 'min'
    const minutes = unit.startsWith('h') ? amount * 60 : amount
    if (minutes > 0 && minutes <= 24 * 60) {
      return { type: 'snooze', number: Number(snooze[1]), minutes }
    }
  }

  const correct = /^corrigir[:\s]+([\s\S]+)$/i.exec(text.trim())
  if (correct && correct[1]!.trim()) {
    return { type: 'correct', text: correct[1]!.trim() }
  }
  return undefined
}

export const HELP_TEXT = [
  'Assistente de Plantão — como usar:',
  '• Mande áudio, texto ou foto com o que aconteceu no plantão.',
  '• "pendências" — lista o que é seu e está aberto.',
  '• "feito 3" — conclui a pendência 3.',
  '• "adiar 3 30" ou "adiar 3 1h" — adia a pendência 3.',
  '• "ok" — confirma a última nota.',
  '• "corrigir <texto>" — refaz a última nota com o texto certo.',
  'O registro oficial continua sendo no HIS.'
].join('\n')
