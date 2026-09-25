# 0133 — SPEC: extração de fatias de `iterative-runtime.ts`

- ID: `SPEC-STRUCT-001`
- Estado: `SPEC_DRAFT_FOR_REVIEW / BUILD_NOT_AUTHORIZED`
- Origem: RA25-07 de [0351](../03_build/0351_audit0573_backlog.md), onda D3 de
  [0350](../03_build/0350_audit0573_roadmap.md).
- Alvo: `packages/harness/src/iterative-runtime.ts` (2 455 linhas).
- Fora de escopo: `apps/api/src/server.ts` (5 857), `packages/persistence/src/postgres.ts`
  (3 354) e `packages/agent-runtime/src/runtime.ts` (2 603) — cada um exige a
  própria SPEC e a própria fatia.

## Recon medido (2026-09-25)

`IterativeGovernedRuntime` é uma god-class: 3 exports no arquivo, classe aberta
na linha 312, 49 métodos somando 2 302 linhas, e apenas ~130 linhas de funções
puras de topo (linhas 113–194 e 2 447).

| Método              | Linhas | `this` usados                                                                                                                                                                   |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatchTool`      | 500    | `stop`, `options`, `operationKey`, `remainingDuration`, `withDeadline`, `recordObservation`, `makeObservation`, `recordStep`, `persistCheckpoint`, `maxObservationPayloadChars` |
| `execute`           | 128    | —                                                                                                                                                                               |
| `runLoop`           | 123    | —                                                                                                                                                                               |
| `dispatchKnowledge` | 116    | `stop`, `remainingDuration`, `options`, `persistCheckpoint`, `withDeadline`, `recordStep`, `makeObservation`, `maxObservationPayloadChars`, `recordObservation`                 |
| `applyResume`       | 96     | —                                                                                                                                                                               |
| `dispatchRespond`   | 91     | `composeResponse`, `stop`, `validateClaims`, `recordStep`, `persistCheckpoint`, `recordObservation`, `makeObservation`                                                          |
| `decide`            | 87     | —                                                                                                                                                                               |
| `composeResponse`   | 66     | `remainingDuration`, `withDeadline`, `options`, `checkAfterUsage`                                                                                                               |
| `finalize`          | 65     | —                                                                                                                                                                               |

Campos declarados na classe: `contextEngine`, `completionEvaluatorOverride`,
`repeatThreshold`, `maxSignatures`, `maxObservationPayloadChars`.

## Por que a fatia precisa de ~1 000 linhas

O domínio de dispatch (`dispatchTool` + `dispatchKnowledge` + `dispatchRespond` +
`composeResponse` + helpers) soma ~773 linhas. Mover só isso deixa o arquivo em
~1 655 linhas, acima do alvo de ~1 500 do critério de pronto. Uma fatia válida
precisa somar o domínio de ciclo de vida (`applyResume`, `finalize`,
`earlyFinish`, `validateDecision`) ou abrir duas fatias.

## Regras normativas

1. **R1 — comportamento idêntico.** Nenhuma regra, ordem de efeito, condição de
   parada, mensagem de erro ou formato de observação muda. Extração é
   movimentação de código, não reescrita.
2. **R2 — contrato público intacto.** `IterativeGovernedRuntime`,
   `IterativeGovernedRuntimeOptions` e o índice do pacote continuam com a mesma
   superfície. Nenhum export novo é adicionado ao `index.ts` do pacote.
3. **R3 — estado explícito.** Métodos extraídos recebem um objeto de contexto
   com os membros de `this` que já usam hoje, sem campo novo, sem cache e sem
   indireção adicional. `this` não é capturado por closure.
4. **R4 — uma fatia por gate.** Cada fatia é um commit próprio com
   `typecheck`, `lint`, `npm test` e cobertura verdes. Extração nunca é
   misturada com correção de regra, renomeação de comportamento ou ajuste de
   teste.
5. **R5 — evidência de não-regressão.** Antes e depois: mesma contagem de testes
   verdes, cobertura do arquivo sem queda e nenhum drift de baseline não
   explicado. Divergência de cobertura é registrada, não mascarada por exclusão.
6. **R6 — rollback.** A fatia é revertível por um único `git revert`; nenhum
   artefato gerado depende da nova topologia.

## Critério de pronto

- Arquivo alvo abaixo de ~1 500 linhas após a fatia.
- `typecheck`, `lint`, `npm test` e cobertura `PASS`; contagem de testes igual
  ou maior que a anterior.
- Nenhum drift de baseline não explicado; `npm run diff:check` exit 0.

## Estado do BUILD

`BUILD_NOT_AUTHORIZED`. O recon foi feito, mas a extração **não** foi executada:
o orçamento de execução do ciclo terminou antes de abrir a fatia, e o próprio
[0351](../03_build/0351_audit0573_backlog.md) exige task e gate de BUILD
próprios por fatia. Nenhuma linha de `iterative-runtime.ts` foi tocada; não há
drift atribuível a RA25-07. A justificativa de não execução está registrada em
[0574](../04_audit/0574_aud0573_execution_evidence_2026-09-25.md).

## Autorização e gates

- Task registrada: RA25-07 em `docs/03_build/0351_audit0573_backlog.md`.
- Revisão independente / humana desta SPEC: `NOT_RUN`. Produção `NO_GO`.
