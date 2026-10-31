# SPEC 0291 BUILD, fatia 1: origem da aprovação no motor, na memória e no runtime governado

Task `AUD0625-APPROVAL-ORIGIN-BUILD-07-20261030` (Claude Sonnet 5.5, sessão 07). Autorização: recibo [human-decisions-25](../USER-DECISIONS-20261028/human-decisions-25.json) (sha256 `b285e6e0…`), ligado à SPEC 0291 R1 (`87a6a44e…`, conferido). Branch `claude/aud0625-approval-origin-07`, a partir da onda 5 (`9a8ab4c7a`). Sem push. RED primeiro em `c5a29df56` (6 + 3 testemunhas `it.fails`, 0 por ambiente).

## Entregue (I1-I4, I2-c; AP01-AP04, AP08, AP11)

- `packages/approval-engine`: `ApprovalOriginSchema` (`conversationId` 1-200, `sessionId` opcional, estrito), `origin` opcional no pedido e no `ApprovalRecord`; o motor o grava no `request`; `assertOriginUnchanged` faz o `InMemoryApprovalStore.update` recusar (`Approval origin is immutable`) qualquer mudança, remoção ou surgimento de origem.
- `packages/agent-runtime`: o pedido de aprovação grava `origin` de `input.conversationId`/`input.sessionId`; `#runExecutionTurn` aplica o I2 depois dos vínculos existentes e antes do ramo de replay e da reserva: `origin_mismatch` quando a conversa difere, quando o registro tem sessão e o turno traz outra **ou nenhuma**; a aprovação segue `APPROVED`. Registro sem origem executa e emite `runtime.origin_unbound` e a métrica `approval_origin_unbound_total` (I3).
- Testes: `aud0625-approval-origin.test.ts` (5, motor) e `aud0625-approval-session-binding-red.test.ts` (11, runtime real); 463/463 em `agent-runtime` + `approval-engine`, cobertura 100% por arquivo nos dois pacotes.

## Desvios da SPEC (para o DF registrar)

1. **I2-c refinado.** A SPEC diz "o registro tem `executionRef` ⇒ `origin_mismatch`". Aplicado literalmente isso quebrou 20 testes existentes: o **motor também grava `executionRef` ao confirmar um efeito** (`confirm`), então toda aprovação executada pelo próprio runtime de biblioteca passa a ter `executionRef`. A regra implementada é: `origin` ausente **e** `executionRef` presente (um pedido de biblioteca sempre grava a origem; o adaptador durável grava `executionRef` e nenhuma origem). Consequência aceita e fail-closed: um registro **anterior à SPEC**, executado pelo runtime (sem origem, com `executionRef` da confirmação) e reapresentado depois, passa a dar `origin_mismatch` em vez do replay `already_executed`. O AP11 prova o cruzamento com um registro sem origem e `executionRef`, e um controle mostra que um registro com origem e `executionRef` segue pela checagem de conversa.
2. **Métrica "por tenant".** A SPEC (I3) pede a contagem de `origin_unbound` por tenant. O contrato de telemetria **proíbe** `tenantId` como atributo de métrica (lista fechada contra alta cardinalidade; `MetricAttributeError`). A métrica leva `capability`; a contagem por tenant sai do evento de auditoria `runtime.origin_unbound`, que carrega o tenant.
3. **Remoção de origem por `insert`.** A imutabilidade da memória fecha o `update`; o `insert` sobrescreve por chave (é como o teste simula um registro antigo). A garantia no banco (coluna e `UPDATE` direto) é da fatia 2 (AP05).

## Verificação

| Gate | Resultado |
| --- | --- |
| RED antes | 9 testemunhas `it.fails` falhando por asserção |
| `agent-runtime` + `approval-engine` | 463/463 |
| cobertura por arquivo nos dois pacotes (`CVG_COVERAGE_PER_FILE=1`) | 100% |
| typecheck, eslint, prettier | 0 / limpos |
| mutação (`mutate-s1.py`, `mutations-s1.json`) | 13/13 mortos: conversa não comparada, sessão nunca comparada, sessão ausente igual, regra durável desligada ou larga demais, auditoria e métrica de `origin_unbound`, pedido que não grava origem ou perde a sessão, motor que não guarda, imutabilidade desligada ou cega à conversa ou à sessão |

Três mutantes sobreviveram na primeira rodada (conversa comparada só junto com a sessão; imutabilidade cega a cada campo) e viraram testes (mesma sessão em outra conversa; cada campo protegido sozinho).

## Próximo

Fatia 2: PostgreSQL (migração **0035**, colunas anuláveis, imutabilidade com `UPDATE` direto recusado, `PostgresApprovalAuthority` grava e lê `origin`; AP05). Depois a fatia 3 (worker AP09, `origin_mismatch` em `outboxOutcomeReasons` AP10, AP06/AP07).
