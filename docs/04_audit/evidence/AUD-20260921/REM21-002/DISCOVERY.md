# REM21-002 — Discovery

## Objetivo

Tornar a fonte de findings e a decisão da Phase 10 computadas, vinculadas ao
candidato/run corrente e fail-closed. A tarefa executa somente em escopo local,
sintético e descartável autorizado por `G21-1`; não valida provider, canal, IdP,
credencial, dado real ou produção.

## Evidência observada

- A auditoria oficial corrente é
  `docs/04_audit/0566_comprehensive_repository_audit_2026-09-21.md`.
- A lista enumerada contém 26 achados `A21-F01` a `A21-F26`, distribuídos em
  11 P0, 1 P1 alto, 10 achados médios e 4 achados baixos.
- O arquivo `certification/findings.json` existente contém arrays e scores
  editáveis; o certifier os consumia diretamente.
- A auditoria A21 identifica essa divergência como `A21-F01` e exige teste
  negativo: um P0 vigente deve impedir promoção.
- O candidato histórico de referência é
  `579d2100c172b5157ed42d1cf983988d3401a8c930353b52e50c589578ea55af`, run
  `run-579d2100c172-mub8591x`; qualquer evidência nova deve declarar seu próprio
  vínculo, sem reescrever o certificado AUD20-008.

## Perguntas de descoberta respondidas

1. **Qual é a fonte autoritativa?** O relatório A21 corrente, com hash SHA-256,
   caminho relativo e localizador de linha registrados no artefato computado.
2. **Quem pode fechar um finding?** Somente um registro de fechamento futuro
   que esteja ligado ao mesmo candidato, run, hash da fonte e evidência local
   verificável. Ausência ou inconsistência permanece aberta.
3. **Como evitar drift?** O parser deve exigir IDs únicos, sequência completa,
   prioridade reconhecida e títulos parseáveis; origem, candidato, run e frescor
   devem acompanhar a saída.
4. **Qual é o comportamento seguro atual?** Os 12 achados de prioridade P0/P1
   permanecem abertos e a decisão derivada é `NO_GO`, independentemente de
   scores ou arrays manuais anteriores.

## Critérios de aceitação descobertos

- `AC-01`: computar exatamente 26 achados da fonte A21; rejeitar faltantes,
  duplicados, prioridades ou títulos não parseáveis.
- `AC-02`: cada saída registra `sourcePath`, `sourceSha256`, `sourceLine`,
  `candidateId`, `runId`, `observedAt` e `freshness`.
- `AC-03`: `phase10-certify.mjs` gera findings e scores da fonte; não usa
  `certification/findings.json` como autoridade de entrada.
- `AC-04`: `phase10-verify.mjs` rederiva a fonte e rejeita findings ausentes,
  manuais, stale, de candidato/run divergente ou score adulterado.
- `AC-05`: teste negativo prova que os P0/P1 correntes forçam `NO_GO`.

## Restrições

Não executar integrações externas, não criar credenciais, não usar dados reais,
não alterar o certificado histórico e não transformar este task em aprovação de
produção. `G21-5`, `G21-6` e a revisão I1 permanecem gates separados.
