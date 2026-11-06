/**
 * SPEC 0317 G4 §3: payments and medical records stay forbidden by the program,
 * whatever the flags say. Classification is lexical over what the composition
 * declares (ids, permissions, capabilities): a complementary defence that
 * refuses honest labels, not proof that an unlabelled plugin is harmless.
 */
export type ForbiddenCapability = 'payments' | 'medical_records'

const PATTERNS: ReadonlyArray<readonly [ForbiddenCapability, RegExp]> = [
  [
    'payments',
    /(?:^|[^a-z])(?:payments?|pagamentos?|billing|cobrancas?|boletos?|pix|invoices?|faturas?|checkout)(?:[^a-z]|$)/
  ],
  [
    'medical_records',
    /(?:^|[^a-z])(?:medical[^a-z]*records?|prontuarios?|ehr|emr)(?:[^a-z]|$)/
  ]
]

function normalize(label: string): string {
  return label
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

export function classifyForbiddenCapability(
  labels: readonly string[]
): ForbiddenCapability | null {
  for (const label of labels) {
    const normalized = normalize(label)
    for (const [capability, pattern] of PATTERNS) {
      if (pattern.test(normalized)) return capability
    }
  }
  return null
}
