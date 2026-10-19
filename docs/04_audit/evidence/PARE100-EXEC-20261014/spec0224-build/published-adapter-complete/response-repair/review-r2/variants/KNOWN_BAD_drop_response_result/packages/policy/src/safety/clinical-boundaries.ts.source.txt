const blockedPatterns = [
  /diagn[oó]stic/i,
  /prescrev|prescri/i,
  /rem[eé]dio/i,
  /tratamento/i,
  /medica[cç][aã]o/i,
  /medication|medicamento|dipirona|ibuprofeno|paracetamol|antibi[oó]tico/i,
  /prontu[aá]rio definitivo/i,
  /cobran[cç]a/i,
  /cancelar consulta/i
]

export function containsSensitiveClinicalOrFinancialAction(
  text: string
): boolean {
  return blockedPatterns.some((pattern) => pattern.test(text))
}
