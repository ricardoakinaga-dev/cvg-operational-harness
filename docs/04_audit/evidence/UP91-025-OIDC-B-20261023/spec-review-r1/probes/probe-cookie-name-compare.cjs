// Sonda sintética, sem rede nem porta (executor da SPEC0259 r2, 23/10/2026).
// Compara o corte da fatia A (trim() do JavaScript) com a regra da r2
// (aparar só SP 0x20 e HTAB 0x09; comparar o nome byte a byte) para nomes
// precedidos de espaços Unicode. Só valores sintéticos.
const NAME = '__Host-cvg_oidc_pending'
const prefixes = {
  SP: ' ', HTAB: '\t', NBSP_A0: '\u00a0', BOM_FEFF: '\ufeff',
  ZWSP_200B: '\u200b', EM_SPACE_2003: '\u2003', IDEOGRAPHIC_3000: '\u3000',
  NEL_0085: '\u0085', VT_000B: '\u000b', FF_000C: '\u000c', LS_2028: '\u2028'
}
const likeA = (header) => {
  for (const segment of header.split(';')) {
    const [n, ...rest] = segment.trim().split('=')
    if (n === NAME) return rest.join('=')
  }
  return null
}
const owsOnly = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '')
const exact = (header) => {
  for (const segment of header.split(';')) {
    const i = segment.indexOf('=')
    if (i < 0) continue
    if (owsOnly(segment.slice(0, i)) === NAME) return owsOnly(segment.slice(i + 1))
  }
  return null
}
const variants = { UPPER: '__HOST-cvg_oidc_pending', lower: '__host-cvg_oidc_pending' }
for (const [label, p] of Object.entries(prefixes)) {
  const header = `a=1; ${p}${NAME}=SYNTHETIC`
  console.log(JSON.stringify({ label, likeA: likeA(header), exactOws: exact(header) }))
}
for (const [label, n] of Object.entries(variants)) {
  const header = `${n}=SYNTHETIC`
  console.log(JSON.stringify({ label, likeA: likeA(header), exactOws: exact(header) }))
}
