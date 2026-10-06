# SPEC 0181 — Contrato do kernel de plugins

- Data: 06/10/2026. Status: `APPROVED` (T3). Perguntas da §9 respondidas e
  BUILD do kernel (KPLG-003) autorizado pelo usuário em 06/10/2026.
- Decisão: [ADR-011](../architecture/adrs/ADR-011-kernel-de-plugins-com-controles-obrigatorios.md).
  Roteiro: [0372](../03_build/0372_kernel_plugins_roadmap.md), cartão KPLG-002.
- Referência: DeepSeek Harness, `~/deepseek-harness` (`docs/cordis-primer.md`,
  `docs/tool-execution-pipeline.md`, `docs/subsystems/tools.md`).
- Contratos preservados: `ToolDefinition`, `PolicyEngine`, `ApprovalEngine`,
  `ApprovalExecutionPort`, `ModelGateway`, `HarnessRuntime.execute` e
  `RuntimeResult` de `packages/contracts/src/contracts.ts`. O kernel novo
  implementa `HarnessRuntime`; consumidores não mudam no KPLG-003.

## 1. Objetivo

Um único loop de agente, com pontos de interceptação nomeados, em que
governança é plugin de controle obrigatório e fail-closed, e capacidades são
plugins trocáveis. Substitui os três pipelines escritos à mão
(`SinglePassGovernedRuntime`, iterativo e `GovernedAgentRuntime`).

## 2. Plugin e host

```ts
type PluginKind = 'control' | 'capability'

interface KernelPlugin {
  readonly name: string // único no perfil
  readonly kind: PluginKind
  readonly provides?: readonly ServiceKey[] // serviços que registra
  readonly requires?: readonly ServiceKey[] // espera até existirem
  apply(ctx: KernelContext): void | Promise<void>
}

interface KernelContext {
  provide<K extends ServiceKey>(key: K, service: Services[K]): Disposer
  get<K extends ServiceKey>(key: K): Services[K] // falha se ausente
  on<P extends HookPoint>(point: P, listener: HookListener<P>): Disposer
  guard(guard: ToolGuard): Disposer // só plugins 'control'
}

type Disposer = () => Promise<void> // espera a quiescência
```

- O host carrega os plugins em ordem de dependência (`requires`). Um ciclo ou
  dependência ausente faz o boot falhar.
- Todo registro devolve `Disposer`. Ao descarregar, o host desfaz os registros
  em ordem inversa e aguarda cada um terminar.
- Uma exceção em `apply` aborta o boot e desfaz o que já foi registrado.

## 3. Serviços (chaves)

| Chave       | Classe     | Origem atual                                                                        |
| ----------- | ---------- | ----------------------------------------------------------------------------------- |
| `model`     | capacidade | `ModelGateway` (`packages/model-gateway`)                                           |
| `tools`     | capacidade | registro de `ToolDefinition`                                                        |
| `policy`    | controle   | `PolicyEngine`                                                                      |
| `approvals` | controle   | `ApprovalEngine` + `ApprovalExecutionPort`                                          |
| `effects`   | controle   | journal de efeitos (`harness/effect-journal.ts`, `agent-runtime/effect-journal.ts`) |
| `audit`     | controle   | ledger encadeado (`HashChainedAuditLedger`, `postgres-audit.ts`)                    |
| `budget`    | controle   | checagens de orçamento hoje em linha nos runtimes                                   |
| `pause`     | controle   | novo; desliga o agente sem perder pendências                                        |
| `log`       | controle   | `trajectory`/`step-store`; registro de turno, passo e chamada                       |

## 4. Pontos de interceptação

| Ponto               | Modo                           | Contrato                                                                   |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `turn/before-step`  | waterfall                      | aceita, reescreve ou rejeita a entrada; `pause` rejeita aqui               |
| `model/before-call` | waterfall                      | pode negar (orçamento) ou ajustar a requisição antes de registrá-la        |
| `tool/pre-execute`  | waterfall                      | decide `allow`, `deny` ou `ask`; `ask` sem aprovação concedida vira `deny` |
| guardas             | serial, sem retorno "permitir" | `ToolGuard` retorna motivo de negação ou `undefined`                       |
| `tool/execute`      | waterfall em volta do corpo    | timeout, retry, métricas; não pode remover o `signal`                      |
| `tool/post-execute` | waterfall                      | aceita, bloqueia ou substitui o resultado; registra efeito                 |
| `tool/result`       | emit (síncrono, só observa)    | resultado final congelado; auditoria                                       |
| `turn/before-reply` | waterfall                      | guarda de saída (fase posterior)                                           |
| `turn/stopping`     | serial                         | encerra o turno; grava o desfecho                                          |

Waterfall: o listener recebe `(valor, next)`. Ele chama `next()` para delegar ou
retorna sem `next()` para decidir. Ordem: controles antes de capacidades. Dentro
de cada classe, vale a ordem do perfil.

```ts
type ToolGuard = (call: Readonly<ToolCall>) => string | undefined
```

## 5. Invariantes de controle

| ID  | Invariante                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | O kernel não inicia se faltar algum controle obrigatório do perfil: `policy`, `approvals`, `effects`, `audit`, `budget`, `pause`, `log`                                                                   |
| I2  | Plugins `capability` não registram guardas, não descarregam controles e não mudam a ordem deles; tentativa falha no boot                                                                                  |
| I3  | Guarda só nega. Uma negação de guarda ou de `pre-execute` não é desfeita por listener posterior                                                                                                           |
| I4  | `ask` sem canal de aprovação, sem resposta ou negado vira `deny`. Aprovação concedida é de uso único e vinculada a tenant, ação, recurso, agente e classificação (comportamento atual de ENG-002/ENG-012) |
| I5  | Toda chamada de ferramenta é registrada no `log` antes de executar. O resultado final é congelado e registrado uma vez                                                                                    |
| I6  | Toda requisição ao modelo é registrada antes do envio e é reconstruível pelo log                                                                                                                          |
| I7  | Exceção em qualquer listener vira resultado de erro normalizado. O loop continua ou encerra o turno com motivo, sem derrubar o processo                                                                   |
| I8  | O `signal` de cancelamento é obrigatório. Cancelamento antes do despacho não executa a ferramenta nem registra efeito                                                                                     |
| I9  | Escrita aprovada sem porta de execução de uso único é recusada (`INSUFFICIENT_EVIDENCE`)                                                                                                                  |
| I10 | Auditoria fail-closed: se o registro de auditoria falhar após um efeito, o turno termina com erro explícito, nunca como sucesso silencioso                                                                |
| I11 | Orçamento é verificado num único lugar (controle `budget`) antes de cada passo, chamada ao modelo e chamada de ferramenta                                                                                 |
| I12 | Pausa reconhecida impede o próximo efeito ainda não iniciado; entradas pendentes não são apagadas                                                                                                         |

## 6. Suíte de conformidade (KPLG-002)

Cada invariante vira pelo menos um teste em `tests/conformance/` (decisão D-0181-2).
A suíte roda **antes** da refatoração contra os três runtimes atuais, por meio de
um adaptador fino que expõe `HarnessRuntime.execute`. O resultado esperado é uma
tabela invariante × runtime com PASS, FAIL ou N/A. As falhas de hoje viram
cartões, não são ignoradas.

| Caso | Invariante | Cenário sintético                                                                         |
| ---- | ---------- | ----------------------------------------------------------------------------------------- |
| C01  | I3         | política permite, guarda nega → ferramenta não roda                                       |
| C02  | I3         | dois controles; o segundo tenta "permitir" depois de negação → continua negado            |
| C03  | I4         | `ask` sem `ApprovalEngine` → negado                                                       |
| C04  | I4         | mesma aprovação reapresentada para outro recurso → negado, sem efeito                     |
| C05  | I5         | ferramenta lança exceção → chamada registrada antes, resultado de erro registrado uma vez |
| C06  | I6         | requisição ao modelo é reconstruída do log byte a byte                                    |
| C07  | I7         | política lança exceção → erro normalizado, processo vivo                                  |
| C08  | I8         | `signal` abortado antes do despacho → zero efeitos no journal                             |
| C09  | I9         | aprovação sem porta de uso único → `INSUFFICIENT_EVIDENCE`                                |
| C10  | I10        | auditoria falha após efeito → turno com erro explícito                                    |
| C11  | I11        | orçamento de chamadas de ferramenta 0 → nenhuma execução                                  |
| C12  | I12        | pausa durante turno → próximo efeito não inicia                                           |
| C13  | I1         | perfil sem `audit` → boot recusado (só kernel novo)                                       |
| C14  | I2         | plugin de capacidade tenta registrar guarda → boot recusado (só kernel novo)              |

## 7. Migração (KPLG-003 e KPLG-004)

1. O kernel novo implementa `HarnessRuntime` ao lado dos atuais.
2. Política, aprovação, journal, auditoria e orçamento atuais são embrulhados
   como plugins de controle, sem mudar comportamento. A suíte do motor e a de
   conformidade precisam passar.
3. `createOperationalHarness` passa a compor o kernel. Os runtimes antigos viram
   fachada fina que delega ao kernel e são removidos quando API, worker e
   Assistente de Plantão migrarem (D-0181-3).
4. A extração do Codex em `packages/agent-runtime` (SPECs 0165–0171) é
   integrada antes do KPLG-004, para não haver duas refatorações no mesmo
   arquivo.

## 8. Fora do escopo

Carregamento de plugins de terceiros em runtime, registro público de skills,
ferramentas de shell e sistema de arquivos, perfis por agente hospitalar,
guarda de saída clínica (só o ponto `turn/before-reply` é reservado), dado
real, provider externo, push e deploy.

## 9. Decisões da revisão (usuário, 06/10/2026)

| ID       | Pergunta                                      | Decisão                                                                                                                                                                                                           |
| -------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-0181-1 | `pause` pode ser opcional em perfis de teste? | **Não.** Obrigatória em todo perfil; nos testes usa implementação em memória. Não existe caminho de boot sem pausa.                                                                                               |
| D-0181-2 | Onde fica a suíte de conformidade?            | **`tests/conformance/`**, na suíte padrão, sem virar pacote nem dependência de workspace.                                                                                                                         |
| D-0181-3 | O que acontece com os runtimes antigos?       | **Fachada fina** que delega ao kernel enquanto API, worker e Assistente de Plantão migram; **removidos** quando o último consumidor interno migrar. Nada foi publicado, então não há cliente externo a preservar. |

## 10. Resultado da conformidade antes do kernel

A suíte executada em 06/10/2026 ([evidência](../04_audit/evidence/KERNEL-PLUGINS-20261006/baseline-and-conformance.md))
acrescenta três exigências ao kernel:

1. **Um contrato de governança só.** Hoje convivem `@cvg/harness-contracts`
   (runtimes do `harness`) e `@cvg/policy-engine` + `@cvg/approval-engine` +
   `runTurn` (`GovernedAgentRuntime`). No KPLG-003 o kernel implementa o
   primeiro; no KPLG-004 o kernel durável do worker passa a usar o mesmo
   contrato, com adaptadores para o que for exclusivo do segundo (reserva,
   incerteza de efeito, outbox).
2. **Desfechos canônicos.** A mesma falha produz hoje desfechos diferentes em
   cada runtime. O kernel fixa um desfecho por causa: canal de aprovação
   indisponível, política indisponível, ferramenta falhou, efeito incerto.
   Negação e efeito incerto são reportados como fatos separados.
3. **As sete lacunas confirmadas fecham no kernel:** chamada registrada antes
   da execução (single-pass), requisição ao modelo reconstruível pelo log (os
   três), exceção normalizada (`GovernedAgentRuntime`) e cancelamento por
   `signal` (single-pass e iterativo). Os `it.fails` correspondentes viram `it`.

## 11. Adendo — settlement retomável e encerramento de chamada (AUD-0598)

Origem: [AUD-0598](../04_audit/0598_reauditoria_kplg004_2026-10-06.md) R01–R04.
Pedido do usuário em 06/10/2026 (corrigir e levar o harness à barra 0373).
Nenhuma invariante é relaxada; I4/I9 (uso único) e I5 continuam valendo.

1. **`ApprovalExecutionPort.release` (opcional, aditivo).** Devolve uma reserva
   cujo efeito comprovadamente não começou. O kernel só a usa quando a parada é
   uma pausa do operador (`cause: operator_paused`), porque só aí a execução
   continua retomável. Cancelamento, prazo esgotado e falha de plugin antes do
   despacho continuam terminais e usam `fail`. Porta sem `release`, ou
   `release` que falha, cai em `fail`. O `DurableApprovalEngineAdapter`
   implementa `release` com `authority.release` (a aprovação volta a
   `APPROVED`); a reserva é devolvida, nunca duplicada.
2. **Checkpoint de despacho não carrega `stopReason`.** A partir do checkpoint
   gravado em `beforeDispatch`, o passo está em andamento e a chamada já foi
   contada; um `APPROVAL_REQUIRED` herdado da espera anterior é removido. Na
   retomada, `pendingDecision` sem `stopReason` significa "chamada em andamento
   já contabilizada". Nenhum campo novo no estado durável.
3. **Chamada registrada é encerrada também nos caminhos de erro.** Exceção do
   hook `beforeDispatch` (checkpoint ou registro de passo) grava um
   `tool/result not_started` e a falha original segue para o loop. Se o
   registro de encerramento de uma chamada negada falhar, o turno termina em
   `INSUFFICIENT_EVIDENCE`, com o motivo da negação na resposta.
4. **Negação numa etapa retomada fecha a própria etapa.** Quando política ou
   aprovação negam um passo que já existe como etapa de ferramenta (aguardando
   aprovação ou em andamento), o iterativo marca essa etapa como `FAILED` com o
   código da negação, em vez de gravar outra etapa no mesmo número.

Testes: `packages/harness/src/__tests__/aud0598-kplg004-regressions.test.ts` e
`tests/conformance/durable-approval-resume.conformance.test.ts` (adaptador e
máquina de estados de aprovação reais).

## 12. Adendo — encerramento perdido não perde a decisão (AUD-0599)

Origem: [AUD-0599](../04_audit/0599_auditoria_entrega_fable_2026-10-06.md)
F01/F02. Completa §11.3 e §11.4 sem relaxar invariantes.

1. Quando o `tool/result` de uma chamada bloqueada falha, o pipeline devolve o
   `INSUFFICIENT_EVIDENCE` e, junto, a decisão original do controle
   (`blocked`, com causa e `approvalId`). A resposta traz o motivo do bloqueio
   em todos os caminhos, inclusive no single-pass depois da reserva.
2. O iterativo encerra a etapa aberta (retomada, ou aberta como `RUNNING` pelo
   checkpoint de despacho) como `FAILED` com o código da decisão:
   `policy_denied`, `approval_denied`, `policy_handoff`,
   `policy_outcome_invalid`, `deadline`, `cancelled` ou `not_started`. Nunca
   grava etapa concorrente no mesmo número e nunca a trata como pausa,
   handoff ou espera de aprovação.
3. Com log saudável vale o mesmo para bloqueios que encerram a execução depois
   que a etapa foi aberta (guarda, cancelamento, conflito na retomada):
   checkpoint terminal e etapa não divergem. A pausa do operador continua
   preservando o checkpoint e a etapa para a retomada.

Testes: `tests/conformance/aud0599-blocked-close.conformance.test.ts`.

## 13. Adendo — encerramento terminal e kernel durável (AUD-0600, PROD-0373)

Origem: [AUD-0600](../04_audit/0600_reauditoria_remediacao_aud0599_2026-10-06.md)
F01/F02 e a barra [0373](../03_build/0373_barra_producao_harness.md),
condições 1 e 10. Nenhuma invariante é relaxada.

1. Se o registro `turn/end` falha, um turno que já tinha parado mantém o
   motivo na resposta (`INSUFFICIENT_EVIDENCE` com a causa anterior).
2. Pausa do operador estaciona a etapa em voo como `WAITING`: nada rodou e
   nada fica reservado. Toda parada terminal do iterativo fecha a etapa
   pendente: `WAITING` com `cancelled`, `deadline` ou `not_started`; etapa
   ainda `RUNNING` (efeito possivelmente iniciado antes de uma queda) com
   `unknown_effect`, nunca como não executada. Paradas retomáveis
   (`TOOL_FAILURE`, `INTERNAL_FAILURE`, espera de aprovação ou de entrada)
   não fecham a etapa; a retomada continua sob o journal de efeitos.
3. `GovernedAgentRuntime` (kernel durável do worker): `model.requested` entra
   na cadeia de auditoria antes da chamada (I6); exceção da política vira
   negação auditada `policy_failed` (I7); com o interruptor de pausa ligado o
   turno termina `paused` antes do modelo, da ferramenta direta e da reserva
   da aprovação (I12), sem consumir nada. O worker devolve o item à fila e,
   enquanto pausado, não pega item novo; interruptor ilegível conta como
   pausa.

Testes: `tests/conformance/aud0599-blocked-close.conformance.test.ts` (seção
AUD-0600), `tests/conformance/agent-runtime.conformance.test.ts` (C06, C07,
C12) e `apps/worker/src/__tests__/worker-operations-postgres.integration.test.ts`.
