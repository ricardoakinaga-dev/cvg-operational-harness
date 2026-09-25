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

## Estado do BUILD — fatia 1 executada

`COMPLETED`. A fatia 1 extraiu 1 065 linhas em oito métodos para
`packages/harness/src/iterative-dispatch.ts` (1 159 linhas), deixando
`iterative-runtime.ts` em **1 488 linhas** — abaixo do alvo de ~1 500.

Métodos movidos: `validateDecision` (58), `applyResume` (95), `dispatchTool`
(498), `dispatchKnowledge` (114), `dispatchRespond` (89), `composeResponse`
(64), `evaluate` (78), `pause` (69).

Desenho: o módulo recebe `IterativeDispatchContext`, construído por um getter
privado dentro da classe, onde os membros privados são acessíveis. Nenhum
membro mudou de visibilidade e `index.ts` do pacote não ganhou export. A
extração foi mecânica, feita por script com verificação embutida: cada bloco
movido foi reconstruído a partir do resultado e comparado byte a byte ao
original, admitindo apenas `this.` → `ctx.` e o recuo de dois espaços. O script
abortaria se qualquer outra diferença aparecesse.

`errorMessage`, `bindCapabilityFingerprint`, `boundedPayload`,
`stringifySummary` e `mapEvaluationToStopReason` passaram a ser exportados do
módulo do runtime para o módulo de dispatch. Isso cria um ciclo de importação
entre os dois arquivos, seguro porque todas as referências cruzadas são
avaliadas dentro de corpos de função, nunca na avaliação do módulo. O ciclo
está documentado no cabeçalho de `iterative-dispatch.ts`.

Verificação: `typecheck`, `lint` e `format:check` exit 0; `packages/harness`
9 arquivos / 121 testes `PASS`; suíte completa 324 arquivos / 2 295 testes
`PASS`; cobertura 92,63 / 87,73 / 94,99 / 93,61, acima dos thresholds e sem
queda em relação ao estado anterior (92,6 / 87,71 / 94,95 / 93,58).

Restante de RA25-07: `apps/api/src/server.ts` (5 857 linhas),
`packages/persistence/src/postgres.ts` (3 354) e `packages/agent-runtime/src/runtime.ts`
(2 603, um único `runTurn` de 2 233 linhas) continuam exigindo a própria SPEC e
a própria fatia.

## Autorização e gates

- Task registrada: RA25-07 em `docs/03_build/0351_audit0573_backlog.md`.
- Revisão independente / humana desta SPEC: `NOT_RUN`. Produção `NO_GO`.
