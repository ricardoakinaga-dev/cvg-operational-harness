export type Command =
  | { type: 'list' }
  | { type: 'done'; number: number }
  | { type: 'snooze'; number: number; minutes: number }
  | { type: 'confirm' }
  | { type: 'correct'; text: string }
  | { type: 'help' }
  | { type: 'template' }
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
  if (/^(novo paciente|modelo|internacao)$/.test(folded)) {
    return { type: 'template' }
  }
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
  '• Fale ou escreva do jeito que for mais rápido: áudio, texto ou foto.',
  '• Sempre diga o nome e o ID do paciente (e o leito, se tiver): pode haver mais de um com o mesmo nome.',
  '• "novo paciente" — mostra um modelo para internação nova.',
  '• "pendências" — lista o que é seu e está aberto.',
  '• "feito 3" — conclui a pendência 3.',
  '• "adiar 3 30" ou "adiar 3 1h" — adia a pendência 3.',
  '• "ok" — confirma a última nota.',
  '• "corrigir <texto>" — refaz a última nota com o texto certo.',
  'O assistente não grava no HIS: ele devolve o texto pronto para você colar lá.'
].join('\n')

export const NEW_PATIENT_TEMPLATE = [
  'Paciente novo — mande em um áudio ou copie, preencha e envie:',
  '',
  'Novo paciente: <nome>, ID <número do HIS>, <espécie>, leito <número>, tutor <nome do tutor>.',
  'Motivo: <por que internou>.',
  'Evolução: <como está agora>.',
  'Pedi <exames>.',
  'Vou <o que ainda vai fazer> às <hora>.',
  '',
  'Exemplo: "Novo paciente: Rex, ID 48213, canino, leito 4, tutor João Silva. Motivo: atropelamento. Evolução: consciente, com dor. Pedi raio-x e hemograma. Vou reavaliar a dor às 22h."',
  'O cadastro oficial do paciente continua sendo feito no HIS.'
].join('\n')
