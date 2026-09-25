# 0130 — SPEC: doc link checker extraction boundary

- ID: `SPEC-DOC-002`
- Estado: `SPEC_DRAFT_FOR_REVIEW`
- Origem: [RA25-03](../03_build/0351_audit0573_backlog.md) (alias `RA24-04-CHECKER`), onda D1 de [0350](../03_build/0350_audit0573_roadmap.md).
- Alvo: `scripts/check-doc-links.mjs` e `tests/docs-check-links.test.js`.
- Fora de escopo: `docs/02_spec/0129_l03_operational_index_generator.md` e
  `docs/04_audit/evidence/AUD-20260924/L03-generator-spec/critique-and-revision-03.md`
  permanecem byte-idênticos; seus SHA-256 já estão citados em registros de gate.

## Problema

O extrator usa `/\[[^\]]*\]\(([^)]+)\)|^\s*\[[^\]]+\]:\s*(\S+)/gm` sobre o texto
bruto. `[^)]+` casa quebras de linha e nenhuma máscara de código é aplicada, então
um candidato link-like dentro de um code span arrasta o texto até o próximo `)`.
Resultado: 5 falsos positivos, todos em prosa que documenta a gramática de links
(`[label](destination)`, `` `[` `` … `` `](` ``), dois deles atravessando linhas.

## Regras normativas

1. **R1 — blocos de código mascarados.** Todo fenced code block (` ``` ` ou `~~~`
   com 0–3 espaços de recuo, delimitador de abertura e fechamento do mesmo
   caractere e comprimento não menor) é substituído por espaços preservando
   offsets e linhas antes da extração. **R1b (fail-closed):** se não houver
   fechamento válido até o fim do arquivo, o bloco **não** é mascarado e suas
   linhas continuam verificadas — nunca se esconde um link real por falta de
   fechamento.
2. **R2 — code spans mascarados.** Runs de backticks são pareados na mesma linha:
   um run de comprimento N fecha em outro run de exatamente N na mesma linha, e o
   intervalo (delimitadores inclusos) é mascarado. Run sem par é texto literal e
   não mascara nada.
3. **R3 — extração somente sobre texto não mascarado.** Padrões de link inline,
   de referência e autolink por ângulo são avaliados apenas contra o texto
   mascarado. Candidato cujo conteúdo está mascarado não é link.
4. **R4 — destination não cruza linha.** `[^)]+` vira `[^)\n]+`: destination
   CommonMark nunca contém line ending. Candidato multilinha não é link e não é
   reportado como quebrado.
5. **R5 — detecção preservada.** Link relativo existente segue passando; link
   relativo inexistente segue com `status 1` e entrada em `broken`; absolutos
   seguem classificados em `nonPortableAbsolute` conforme
   `docs/doc-link-policy.json`.
6. **R6 — classificação e exit codes inalterados.** Formato do JSON de saída,
   chaves, políticas de allowlist e códigos de saída não mudam.

## Fixtures obrigatórias

- Positivas: link relativo existente com `:linha` e com `#fragmento`.
- Negativas (não podem gerar `broken`):
  `` `[label](destination)` ``, `` `[label](<destination>)` ``,
  `` `[label](` `` em prosa, `` `[` `` … `` `](` `` na mesma linha, e
  link-like dentro de fence.
- Regressão: link realmente quebrado na linha seguinte a um artefato de código
  continua rejeitado; link quebrado vizinho a um code span continua rejeitado.

## Critério de pronto

- `node scripts/check-doc-links.mjs README.md docs` → exit 0.
- Fixture propositalmente quebrada → exit 1 com 1 entrada em `broken`.
- `npm test` → PASS; `npm run format:check`, `npm run typecheck`, `npm run lint` → PASS.

## Autorização e gates

- Task registrada: RA25-03 em `docs/03_build/0351_audit0573_backlog.md`.
- BUILD executado sob a instrução explícita do usuário de 2026-09-25
  (“Implemente todo o conteúdo dos documentos planejados”).
- Revisão independente / humana desta SPEC: `NOT_RUN` — registro aqui não
  constitui aprovação humana. Nenhum gate de produção, dados reais, integração
  externa, IdP ou canal é afetado; produção permanece `NO_GO`.
