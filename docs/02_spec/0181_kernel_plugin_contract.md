# SPEC 0181 — Contrato do kernel de plugins

- Data: 06/10/2026. Status: `DRAFT / AGUARDANDO_REVISAO_DO_USUARIO` (T3).
  O BUILD do kernel (KPLG-003) só começa depois da revisão.
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

Cada invariante vira pelo menos um teste em `packages/harness/src/__tests__/conformance/`.
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
3. `createOperationalHarness` passa a compor o kernel. Os runtimes antigos ficam
   como fachada fina até o KPLG-004, e depois são removidos.
4. A extração do Codex em `packages/agent-runtime` (SPECs 0165–0171) é
   integrada antes do KPLG-004, para não haver duas refatorações no mesmo
   arquivo.

## 8. Fora do escopo

Carregamento de plugins de terceiros em runtime, registro público de skills,
ferramentas de shell e sistema de arquivos, perfis por agente hospitalar,
guarda de saída clínica (só o ponto `turn/before-reply` é reservado), dado
real, provider externo, push e deploy.

## 9. Perguntas para a revisão

1. A lista de controles obrigatórios (I1) está certa para todo perfil, ou
   `pause` pode ser opcional em perfis de teste?
2. A suíte de conformidade pode ficar dentro de `packages/harness`, ou deve
   ser um pacote próprio (`packages/conformance`)?
3. Os runtimes antigos são removidos no KPLG-004, ou mantidos como
   compatibilidade por uma versão?
