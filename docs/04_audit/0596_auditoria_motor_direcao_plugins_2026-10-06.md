# 0596 — Auditoria do motor e direção: kernel de plugins (05–06/10/2026)

- Task: `KERNEL-PLUGINS-20261006` (Claude Code). Decisão de arquitetura:
  [ADR-011](../architecture/adrs/ADR-011-kernel-de-plugins-com-controles-obrigatorios.md).
  Roteiro: [0372](../03_build/0372_kernel_plugins_roadmap.md).
- Escopo: o que falta para colocar o programa em produção, e como reorganizar o
  motor para isso. Somente leitura de código e testes locais; nenhum dado real,
  provider externo, push ou deploy.
- Produção: `NO_GO`.

## 1. Decisões do usuário registradas nesta rodada

1. **O produto é o Operational Harness.** É o núcleo e é o que vai para produção.
2. **O Assistente de Plantão existe para validar o harness**, e não o contrário.
   É uma camada acima, acoplada ao harness por interfaces públicas; o núcleo
   nunca importa o assistente.
3. **Visão:** o harness é o motor de agentes semiautônomos de hospital
   veterinário. Os agentes conversam com veterinários e tutores, tiram dúvidas,
   apoiam a passagem de plantão estruturada, agendam, sobem e enviam exames e
   notificam exames pendentes. Tudo da área hospitalar **menos diagnóstico e
   prescrição**.
4. **Primeiro o motor fica estável**; a discussão do que cada agente pode fazer
   vem depois.
5. **Linha de referência: DeepSeek Harness**, com plugins como forma de controle
   do agente. Ele é a fonte de consulta do redesenho. Cópia local em
   `~/deepseek-harness` (commit `280156b0a9`, 30/09/2026; `dsh` 0.2.0-rc.1).
6. Seguir a ordem 1–6 do roteiro 0372, para não quebrar nada.

## 2. Medições (05–06/10/2026, checkout compartilhado)

| Verificação                                                                                            | Resultado                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Testes dos pacotes do motor (`harness`, `agent-runtime`, `orchestrator`, `contracts`, `model-gateway`) | 31 arquivos / 520 testes PASS (4 s)                                                                                    |
| `npm run test:shift-assistant`                                                                         | 2 arquivos / 37 testes PASS                                                                                            |
| `npm run typecheck` (raiz)                                                                             | PASS                                                                                                                   |
| `npm audit --omit=dev`                                                                                 | 0 vulnerabilidades                                                                                                     |
| Disco                                                                                                  | 205 GB livres; `docs/04_audit/evidence` ocupa 1,5 GB                                                                   |
| Worktree                                                                                               | 174 caminhos alterados: cerca de 110 são documentos e evidência; o código pendente pertence às frentes ativas do Codex |

Correção de uma afirmação feita na conversa: as correções do motor ENG-001 a
ENG-018 **já estão commitadas** em `73669b8`. Ficaram de fora só as alterações
do Codex nos arquivos compartilhados (a extração em
`packages/agent-runtime/src/runtime.ts`, testes novos de `apps/api`, o move de
`apps/worker/src/shift-assistant`).

## 3. Diagnóstico

O código do motor está melhor do que os ledgers fazem parecer. A sensação de
"cada hora um problema" vem de duas fontes:

**Processo que não fecha.** Uma única SPEC (0162) passou por onze rodadas de
crítica e segue esperando aprovação. A certificação está na rodada R72. A última
certificação completa morreu por falta de disco (ENOSPC), não por defeito.

**Motor fragmentado.** O pipeline de governança (orçamento → política →
aprovação → execução → journal → auditoria) está escrito à mão em três lugares:

| Onde                                                                  | Tamanho                                      |
| --------------------------------------------------------------------- | -------------------------------------------- |
| `packages/harness/src/runtime.ts` (`SinglePassGovernedRuntime`)       | 1.236 linhas; o `run()` sozinho ocupa ~1.000 |
| `packages/harness/src/iterative-dispatch.ts` + `iterative-runtime.ts` | 2.676 linhas                                 |
| `packages/agent-runtime/src/runtime.ts` (`GovernedAgentRuntime`)      | 1.501 linhas                                 |

Somam-se `agent-core`, dois pacotes de política (`policy` e `policy-engine`) e
19 pacotes no total. A checagem de orçamento aparece repetida antes de cada fase
(mais de 20 vezes só no single-pass). Defeitos corrigidos num runtime precisam
ser caçados nos outros. Foi o que aconteceu com ENG-001/ENG-008, auditoria
pulada no single-pass e depois no iterativo.

### Problemas reais em aberto no motor

1. **ENG-014:** em `CVG_IDENTITY_MODE=trusted`, obrigatório em produção, toda
   rota protegida da API responde 503. A frente é do Codex.
2. **ENG-007:** duas pilhas de runtime coexistem.
3. **HISO-011:** o transporte de modelo lê a resposta inteira antes de aplicar o
   limite de tamanho.
4. **CI remoto:** vermelho na última verificação (28/09). CodeQL high e
   `secret-scan` falhavam, e o commit atual nunca foi publicado.
5. **Não existe barra de produção do harness.** A 0368 é do assistente, o 0354 é
   histórico, e o HISO-010 proíbe reaplicar automaticamente os 16 gates antigos.

## 4. Comparação com o DeepSeek Harness (`dsh`)

Fontes lidas na cópia local: `docs/architecture.md`,
`docs/tool-execution-pipeline.md`, `docs/subsystems/tools.md`,
`docs/cordis-primer.md`, `docs/defensive-patterns.md` e `SAFETY.md`.

### Loop do agente

| `dsh`                                                                                                                                                | Nosso motor                                                                                                    | Lacuna                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Um único loop (`core/agent-loop`) com pontos de extensão nomeados: `agent/pre-step`, `agent/request`, `llm/stream`, `tools/*`, `agent/turn-stopping` | Três loops independentes, com as fases escritas em linha                                                       | **Alta:** é a causa da duplicação de defeitos      |
| Turno e passo são eventos duráveis (`turn/start`, `step/start`, …)                                                                                   | `trajectory`/`step-store` existem no harness; o worker `kernel` grava o ledger em `audit_events` desde ENG-013 | Média: o vocabulário não é único entre os runtimes |
| "Model-visible means logged": toda requisição ao modelo é reconstruível pelo log                                                                     | Não comprovado para os três runtimes                                                                           | **A verificar** com teste                          |
| Cancelamento por `signal` **obrigatório** em todo o pipeline                                                                                         | `signal` opcional, acrescentado em ENG-003                                                                     | Média                                              |
| Guarda de repetição de ferramenta (`repeat-tool-reminder`)                                                                                           | `harness/src/loop-detection.ts`                                                                                | Equivalente                                        |

### Capabilities (ferramentas)

| `dsh`                                                                                                                                                                                    | Nosso motor                                                                                         | Lacuna                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Pipeline único: `tools/pre-execute` (permitir/negar/perguntar) → guardas monotônicas → `tools/execute` (timeout, retry e métricas em volta) → `tools/post-execute` → resultado congelado | Política, aprovação e execução chamadas em sequência dentro de cada runtime                         | **Alta**                                             |
| **Guarda monotônica:** só pode negar ou se abster, sem resultado "permitir"; nenhum plugin posterior desfaz uma negação                                                                  | Uma única chamada `policy.evaluate`; não há como empilhar controles independentes com essa garantia | **Alta:** é exatamente o "plugin de controle" pedido |
| Aprovação de uso único; canal de aprovação ausente vira negação                                                                                                                          | Porta de execução de uso único (ENG-002) e recusa sem porta                                         | Equivalente; o nosso é durável em PostgreSQL         |
| `tool/call` gravado **antes** da execução; resultado final imutável                                                                                                                      | Journal de efeitos para escritas; leituras não passam pelo mesmo registro                           | Média                                                |
| Exceção em plugin é normalizada em erro e não derruba o loop                                                                                                                             | Tratamento caso a caso                                                                              | Média                                                |
| Registro de capacidade com três papéis (definição, provedor, consumidor) e troca de provedor por configuração                                                                            | `capability-boundary.ts` e `ToolDefinition`                                                         | Média                                                |

### Orquestração e composição

| `dsh`                                                                                                  | Nosso motor                                                                      | Lacuna                                   |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------- |
| Plugins se encontram por chave de serviço (`ctx.tools`, `ctx.llm`) e declaram dependências (`inject`)  | `createOperationalHarness` recebe um objeto de opções montado à mão              | Média                                    |
| Registros reversíveis; descarregar um plugin desfaz o que ele instalou; o dispose espera a quiescência | Sem ciclo de vida de componente                                                  | Média                                    |
| Eventos tipados com modo de despacho declarado (`emit`, `waterfall`, `serial`, `bail`)                 | `platform/src/event-bus.ts` existe, mas o motor não o usa como ponto de extensão | Média                                    |
| Perfis e bundles compõem a árvore de plugins no boot                                                   | Presets em `platform/controlled-preset.ts`                                       | Baixa                                    |
| Orquestrador como plugin do loop                                                                       | `orchestrator/hybrid-orchestrator.ts` (regras + modelo, ciclo de reparo)         | Baixa: o desenho já é separado (ADR-002) |

### Onde o nosso motor é mais forte e deve ser preservado

- Journal de efeitos durável em PostgreSQL, com idempotência validada após
  reinício (0371).
- Aprovação durável com autoridade e vínculo a ação, recurso e agente (ENG-012).
- Isolamento por tenant com RLS e papéis de runtime sem `BYPASSRLS`.
- Auditoria encadeada por hash, com cadeia verificada por SQL.

O `dsh` declara em `SAFETY.md` que é software experimental, sem auditoria de
segurança e "must not be treated as secure or production-ready". Os presets
padrão executam shell e mexem em arquivos. Por isso a direção é **copiar o padrão, não o
código**.

### Como "validar vendo o dsh"

As invariantes do `dsh` viram uma **suíte de conformidade** escrita contra o
nosso motor **antes** da refatoração (passo 2 do 0372). Ela mostra o que já
vale hoje e protege o que precisa continuar valendo depois. Exemplos:

- uma negação não é desfeita por controle posterior;
- aprovação ausente ou sem canal vira negação;
- cancelamento antes do despacho não executa nem registra efeito;
- exceção em controle vira erro normalizado e não derruba o processo;
- toda chamada é registrada antes de executar;
- toda requisição ao modelo é reconstruível pelo log.

## 5. Assistente de Plantão como validador

Hoje ele quase não valida o harness: do núcleo, usa apenas
`OpenAICompatibleProvider` de `@cvg/model-gateway`. Confirmação, lembretes,
registro de eventos e pausa são reimplementados dentro do produto, e é lá que
estão os defeitos encontrados:

| Defeito                                                   | Local                                                                                     | Cartão       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------ |
| Lembrete dispara para tarefa de nota ainda não confirmada | `products/shift-assistant/src/assistant.ts` (`tick`, criação de tarefas junto com a nota) | PISO-001     |
| Lembrete pode duplicar (lê → envia → grava)               | `assistant.ts` (`tick`)                                                                   | PISO-005     |
| `/health` responde 200 sempre que o processo está vivo    | `products/shift-assistant/src/server.ts:64`                                               | PISO-006     |
| Chamadas ao WhatsApp sem timeout                          | `products/shift-assistant/src/whatsapp.ts` (quatro `fetch`)                               | PISO-006     |
| Sem alerta, sem backup e sem `fsync` do journal           | produto inteiro                                                                           | PISO-004/008 |
| `deploy/.env.example` referenciado e ausente              | `products/shift-assistant/deploy/`                                                        | HISO-007     |

Direção: esses fluxos passam a usar o motor em vez de reimplementá-lo. A
confirmação prova a aprovação de uso único, o lembrete prova o journal de
efeitos, o histórico prova a auditoria e a chamada à IA prova o `ModelGateway`
(passo 6 do 0372). Os defeitos não são remendados dentro do produto.

## 6. Pendências que dependem de pessoas

- Definir a barra de produção do harness (proposta no passo 2 do 0372).
- Revisar as SPECs T3 paradas desde 28/09 (0157, 0158, 0159 e 0162) e decidir
  quais continuam valendo.
- Para os agentes hospitalares, numa fase posterior: qual sistema o hospital usa
  (HIS e API), quais canais, até onde vai a autonomia do agendamento, e o
  contrato de tratamento de dados com o provedor de IA. A regra atual do
  `AGENTS.md` que proíbe agendar automaticamente só muda com ADR própria.

## 7. Próximos passos

Seguir o [roteiro 0372](../03_build/0372_kernel_plugins_roadmap.md), na ordem:

1. Consolidar e ter uma linha de base verde.
2. ADR-011, SPEC do contrato de plugins e suíte de conformidade.
3. Kernel com host de plugins.
4. Unificar as pilhas.
5. Modelo e canais como plugins.
6. Assistente como plugins.

## 8. Validação do núcleo contra o dsh (06/10/2026)

O usuário definiu a ordem: validar todo o núcleo usando o dsh como referência
de arquitetura, e só depois construir camada a camada até o agente.

**Linha de base (KPLG-001)**, no commit `a7dd030` em worktree isolado, com Node
22.23.2 e PostgreSQL próprio:

- suíte completa: 2.646 testes passaram, 1 pulado;
- `test:postgres`: 288 testes passaram;
- typecheck e lint passaram.

**Suíte de conformidade (KPLG-002)**, em `tests/conformance/`: 26 testes
passaram e 7 lacunas foram confirmadas com `it.fails`, nos três runtimes.
Resultado completo em
[evidência](evidence/KERNEL-PLUGINS-20261006/baseline-and-conformance.md).

| Invariante                                                  | Single-pass  | Iterativo    | `GovernedAgentRuntime` |
| ----------------------------------------------------------- | ------------ | ------------ | ---------------------- |
| Aprovação ausente vira negação; uso único                   | PASS         | PASS         | PASS                   |
| Chamada registrada antes de executar                        | LACUNA       | PASS         | PASS                   |
| Requisição ao modelo reconstruível pelo log                 | LACUNA       | LACUNA       | LACUNA                 |
| Exceção vira desfecho normalizado                           | PASS         | PASS         | LACUNA                 |
| Cancelamento antes do despacho                              | LACUNA       | LACUNA       | PASS                   |
| Auditoria falhando após efeito não vira sucesso             | PASS         | PASS         | PASS                   |
| Guardas que só negam; pausa; controles obrigatórios no boot | inexistentes | inexistentes | inexistentes           |

Achados novos:

- **Dois contratos de governança.** Os runtimes do `harness` usam
  `@cvg/harness-contracts`; o `GovernedAgentRuntime` usa `@cvg/policy-engine`,
  `@cvg/approval-engine` e `runTurn`. O kernel precisa de um contrato só.
- **A mesma falha gera desfechos diferentes** em cada runtime. Por exemplo, com
  o canal de aprovação fora do ar, o iterativo responde `APPROVAL_REQUIRED`, como
  se estivesse esperando aprovação.
- O `GovernedAgentRuntime` responde `denied` quando o efeito chegou a acontecer
  e ficou incerto, em vez de reportar os dois fatos separados.

Cada lacuna é coberta por um teste que hoje falha de propósito. Quando o kernel
fechar a lacuna, o teste avisa e vira teste comum.
