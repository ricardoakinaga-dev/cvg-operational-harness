# AUD0625-REVIEW-F18-D9 — revisão independente da fase 1 do F18 (SPEC 0280), só por leitura

Revisor: Claude D9 (Sonnet 5.5). Alvo: `codex/aud0625-f18-phase1-20261029` @ `78ace0a25` (base `d8a3e592`). Revisão estática: li a SPEC, o teste e o código do kernel; **não rodei nada** (pedido do DF durante a janela de disco). É revisão, não aceite. Produção `NO_GO`.

Veredito: **APPROVE da fase 1** (diagnóstico correto, RED pela razão certa), com 3 P3 de endurecimento dos oráculos e 1 sugestão de escopo para o BUILD.

## 1. O diagnóstico corresponde ao achado F18 da auditoria 0625?

Sim. O F18 diz: "hooks internos recebem estado mutável e podem remover grant ou substituir resultado após controles; a ordem de execução não prova monotonicidade; superfície interna não suportada; fechamento: estado privilegiado separado, recusas não relaxáveis e regressão interna; não é bypass da API pública". A SPEC 0280 repete exatamente esse recorte (§1: composição interna, `createKernelRuntime`/`standardKernelPlugins`, a fábrica canônica `createOperationalHarness` não tem opção `plugins`, plugin JS é código confiável do host) e propõe o fechamento pedido (D1 autoridade privada, D2 fatos bloqueantes não relaxáveis, D3 compatibilidade, D4 contratos adjacentes). Não exagera a severidade.

Conferi o mecanismo no código do kernel (`packages/harness/src/kernel/`):

- R1 (grant apagado): `ToolCallState.grant` é campo mutável (`types.ts:107`). O controle de aprovação o preenche em `tool/pre-execute` (`controls.ts:521`), e o `tool/execute` do mesmo controle começa com `if (!call.grant) return next()` (`controls.ts:442`): sem grant, **segue direto para o corpo, sem reserva**. Um hook de capability depois do controle que faz `delete call.grant` produz exatamente `corpo 1, reserva 0`. É fail-open por construção, não só por mutabilidade.
- R2, R3, R4: hooks `tool/post-execute` e `turn/end` de capability devolvem um resultado novo (`succeeded`, `COMPLETED`) e o acumulador final o aceita sem reconciliar com os fatos dos controles. Os controles são o grupo de comparação certo: cada RED tem um controle ordinário que mostra o comportamento correto sem o hook (`TOOL_FAILURE`/`unknown_effect`, `INSUFFICIENT_EVIDENCE`, `POLICY_DENIED` com zero efeito, e o caminho limpo com 1 reserva, 1 corpo, 1 confirmação).

## 2. O teste RED falha pela razão certa?

Sim.

- O arquivo no branch (`tests/aud0625-internal-hooks-authority-red.test.ts`) é idêntico ao `test-source.ts.txt` da evidência, e o SHA256 da SPEC no branch é `8e15a9d3…247fb1c2ba25bb557d4f7cd76ebe`, o declarado.
- O `beforeAll` executa o SUT e só valida infraestrutura (`stopReason` diferente de `INTERNAL_FAILURE`, 1 chamada de auditoria, 1 `turn/end`), sem exigir o comportamento defeituoso como pré-condição: assim o futuro fail-closed pode ficar verde sem reescrever a preparação. É a escolha certa.
- As quatro asserções invertidas são oráculos de autoridade e monotonicidade ("não pode virar COMPLETED", "mantém INSUFFICIENT_EVIDENCE", "corpo sem reserva é falso"), cada uma ligada a um hook que o teste instala só no modo relaxador; o relatório do Codex informa 4 falhas de asserção e 4 controles passando ao remover `it.fails`, 0 falhas de preparação. Só objetos sintéticos em memória.
- Nenhuma fonte de runtime, lockfile ou ledger foi alterada: o diff contra a base fora de `docs/` é só o teste novo (conferi com `git diff --name-only`).

## 3. Achados

- **P3-1 (oráculo fraco, R2):** `expect(stopReason).not.toBe('COMPLETED')` aceitaria qualquer outro desfecho (por exemplo `INTERNAL_FAILURE`). A SPEC exige `TOOL_FAILURE`/`unknown_effect` sem repetir o `complete`. Para o BUILD: afirmar `stopReason` igual a `TOOL_FAILURE`, o texto `unknown_effect: approval confirmation failed` (o mesmo do controle) e `completeCalls === 1`.
- **P3-2 (oráculo fraco, R4):** idem: `not.toBe('COMPLETED')` em vez de `POLICY_DENIED`, com corpo 0, reserva 0 e `effects` vazio, como no controle.
- **P3-3 (cobertura):** o RED cobre `pre-execute`, `post-execute` e `turn/end`. Os campos mutáveis restantes de `ToolCallState` (`needsApproval`, `policyDecision`, `approval`, a reserva mantida até o `post-execute`) e o `next` chamado duas vezes ou nenhuma estão na tabela de aceite F18-E/F, mas sem RED. Aceitável na fase 1; antes do BUILD vale um RED para `delete call.approval` em `post-execute` (a liquidação da reserva é pulada?) e para o hook que não chama `next`.
- **Sugestão de escopo para o BUILD (não é achado):** o fail-open de `tool/execute` (`if (!call.grant) return next()`) é independente do estado mutável: uma ferramenta com `requiresApproval` sem grant deveria parar em `INSUFFICIENT_EVIDENCE`, mesmo sem plugin. Isso é uma defesa em profundidade pequena e verificável que cobre R1 já na primeira fatia vertical (grant → reserva → efeito → liquidação), antes da separação completa de estado privado.

## 4. Limites desta revisão

Não executei o teste nem o CI do Codex (instrução do DF); confiei nos números do `RESULT.md` (4 RED/4 controles, 188 casos verdes, typecheck/lint 0) e conferi por leitura o que é verificável sem rodar. Nenhuma decisão de produto foi tomada: D1–D4 seguem para a revisão humana do hash `8e15a9d3…`.
