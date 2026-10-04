# 0369 — Roadmap do Operational Harness e isolamento do consumidor

> Continuidade GREEN em 04/10/2026: revisões locais de CI e operações terminaram REJECT, com findings concretos preservados. CI-R3 e OPS-R4 corrigem os mecanismos em cópias disjuntas. A suíte completa atual teve 3.504 PASS/um FAIL; o neutro, 2.993 PASS/um FAIL. A falha comum da contagem de testes novos foi corrigida e os 164 controles focados passaram em cada variante; os três defeitos documentais anteriores foram resolvidos. Nova suíte completa está em execução. As imagens atuais passaram controles locais; o bootstrap de sessões em produção e a segurança têm emendas T3 pendentes. Global **FAIL**, produção **NO_GO**, zero chamadas OpenAI; 24 cartões preservados, sem novo DONE. [Checkpoint 15](../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-15-cross-context-receipts-and-ci-validation.json).

Data: 03/10/2026. Task documental: `HARNESS-ISO-PLAN`. Direção do usuário: este é o repositório do Operational Harness, e o programa acoplado deve permanecer isolado. Contrato de direção: [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md). Carteira canônica de execução: [0370](0370_harness_product_isolation_backlog.md).

**Entrega desta rodada: planejamento T1.** Layout e milestones são proposta executável; nenhum arquivo de produto foi movido e nenhum gate de BUILD foi concedido pela criação destes documentos. A correção de direção é explícita; a implementação deve seguir `DISCOVERY → PRD → SPEC → BUILD → AUDIT`, proporcional ao risco de cada fatia.

## Resultado pretendido

Um Operational Harness que pode ser compilado, testado e executado sem o Assistente de Plantão. Um consumidor isolado que usa interfaces suportadas do harness/adapters e tem domínio, processo, dados, deploy, testes e backlog próprios. As correções do produto ficam no consumidor; as correções compartilhadas ficam no pacote que realmente as implementa.

A prioridade imediata é retirar o programa de `apps/worker/src/shift-assistant/` para um workspace privado em `products/shift-assistant/`. Repositório separado pode ser uma evolução futura, mas não é pressuposto para executar este plano.

## Baseline e acoplamentos confirmados

- HEAD observado: `cc1402ff163a34352c10405e9e5c77c653596084`, com checkout modificado e claims concorrentes. O manifesto desta rodada identifica os inputs documentais e de fronteira.
- Produto: **17 arquivos TypeScript**, entrypoint/composição próprios, store JSONL, configuração `SHIFT_*`, WAHA/Evolution, Whisper, organizador, comandos e simuladores. Imports externos de produção observados: `@cvg/model-gateway`, `zod` e bibliotecas Node.
- Não foram encontrados imports diretos do produto nos fontes TypeScript de `packages/`, `apps/api`, `apps/web` ou no restante de `apps/worker/src`. Isso é observação de fontes, não prova de todos os imports dinâmicos ou de execução independente.
- Acoplamento confirmado: alojamento no worker genérico; glob de workspace/TypeScript/Vitest/coverage; Dockerfile que copia `apps`, `packages` e `legacy`; documentação que identifica harness e produto como a mesma missão; barra/CI sem dono claramente separado.
- AUD0594 comprovou 2.357 testes PASS/189 SKIP, 37 específicos e 12 sondas negativas. São evidências da auditoria anterior, não nova validação de código nesta rodada. A nota 61/100 abrange harness **e produto**; não deve ser reapresentada como nota exclusiva do núcleo.

Fontes: [auditoria](../04_audit/0594_repository_score_audit_2026-10-02.md), [evidências de planejamento](../04_audit/evidence/HARNESS-ISO-PLAN-20261003/), [SPEC atual do produto](../02_spec/0177_assistente_plantao_fase1_caderno.md) e [factory pública](../../packages/harness/src/createOperationalHarness.ts).

## Contratos preservados na transição

| Fronteira                                      | Dono alvo                                                     | Regra                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Tipos e ports neutros                          | `packages/contracts`                                          | Sem prompts, identidade de paciente, regras hospitalares ou dependência do produto.                                   |
| Decisão e execução governada                   | `packages/orchestrator`, `packages/harness`, kernel existente | Policy/approval/effect journal preservados; consumidor não troca implementação interna por import privado.            |
| Modelos, transporte e telemetria reutilizáveis | Packages atuais responsáveis                                  | Corrigir limite/timeout no adapter compartilhado; domínio e mensagens de plantão não entram no adapter.               |
| Paciente, notas, comandos e lembretes          | `products/shift-assistant`                                    | Confirmação, identidade, JSONL, WhatsApp e retenção são contratos do consumidor.                                      |
| Processo, env, imagem e volumes                | Host de cada projeto                                          | Processo do harness não lê `SHIFT_*`; consumidor não compartilha automaticamente credenciais ou dados com API/worker. |
| Documentação e backlog                         | Harness e consumidor, cada um em sua raiz                     | Uma fonte de status por cartão; transferência com links, preservando histórico.                                       |
| Liberação                                      | Autoridade de cada artefato                                   | Barra 0368 libera apenas o consumidor no escopo aprovado; não certifica o harness.                                    |

## Marcos e sequência

| Marco                                | Entrega e cartões                                                                            | Dependência                         | Critério para sair                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| M0 — Fronteira e SPEC                | HISO-001–003: baseline, reconciliação de missão e SPEC de extração                           | Pedido atual e fontes vigentes      | Paths/owners/claims conhecidos, contratos congelados e tasks prontas; nenhuma aprovação de comportamento presumida. |
| M1 — Workspace consumidor            | HISO-004–006: extração coerente, gate de imports e descoberta de workspaces/testes           | M0                                  | Entry/demos/testes rodam no novo local; harness não depende do produto; estado persistido mantém formato.           |
| M2 — Integração e operação separadas | HISO-007–010: artefatos, docs/backlogs, consumo público e CI                                 | M1                                  | Comandos e imagem próprios; testes antigos preservados; contrato de CI revisado; dono de cada gate explícito.       |
| M3 — Qualidade compartilhada         | HISO-011–013: recepção limitada, dependências e regressão governada                          | Contratos M0/M1; M2 para fechamento | Negativo P12 fechado, advisories tratados por exposição/artefato, policy/approval/recovery sem regressões.          |
| M4 — Correções do consumidor         | PISO-001–008: confirmação, paciente, journal, retry, lembrete, pausa, deploy, restore/alerta | Extração/documentação do consumidor | Negativos P01–P11 fechados e controles técnicos aplicáveis da barra comprovados no candidato do produto.            |
| M5 — Aceite de isolamento e handoff  | HISO-014: independência integrada; PISO-009–010: preparação e eventual piloto                | M2/M3 para harness; M4 para produto | Harness independente pode ser aceito mesmo com piloto pendente; uso real só pelo gate específico do consumidor.     |

M3 e M4 podem avançar em paralelo após M1, com contratos compartilhados estabilizados e writers/recursos disjuntos. HISO-011 altera o transporte de modelo; PISO-006 altera o transporte WhatsApp do produto. HISO-012, mudanças de workspace e lockfile são sequenciados sob um único claim. Claims ativos de outros agentes continuam obrigatórios; não assumir liberação pela idade de uma entrada.

## Gates de execução

| Gate              | Quando                                                                | Evidência exigida                                                                                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0 — Planejamento | Esta entrega                                                          | Links/formato, inventário, DAG sem ciclos, cobertura F01–F14 e clareza de ownership.                                                                                                                                                                 |
| G1 — Extração T2  | Antes/depois de HISO-004–007                                          | SPEC curta/task/claim; Node 22, typecheck/lint, suíte completa, PostgreSQL e E2E em snapshot próprio conforme D-12; 37 testes/demos do produto preservados. SKIP não é PASS de integração.                                                           |
| G2 — Fronteira    | HISO-005/006/009/014                                                  | Negativo de import proibido reprovado; build/jornada do harness com o workspace consumidor ausente; build/teste do produto através de interfaces suportadas.                                                                                         |
| G3 — Alteração T3 | CI/evidência, contratos de execução/estado, segurança e novos limites | SPEC concreta e revisão humana antes do BUILD, regressões derivadas da auditoria e claims próprios. Este roadmap não substitui a revisão.                                                                                                            |
| G4 — Liberação    | Eventual release/piloto                                               | Decisão humana vinculada ao candidato e à barra aplicável. Para piloto interno do assistente, preservar a barra 0368 aprovada; certificação antiga de 16 gates não é retomada automaticamente. Release do harness exige seu próprio escopo definido. |

Mudança estrutural T2 deve preservar efeitos e contratos. Se o deslocamento exigir API pública, schema persistido ou mudança de segurança, parar essa fatia e preparar T3. Não reduzir denominadores de coverage ou excluir regressões para fazer a extração passar.

## Estratégia de migração e recuperação

1. Capturar fontes/claims/manifestos e aceitar a SPEC curta de extração. Fixar os hashes dos eventos/documentos sintéticos antes da migração.
2. Construir uma fatia integrada: novo workspace, fontes/testes, entrypoint e scripts mínimos. Registrar workspace e lockfile na mesma fatia, com claim próprio; manter paths/contratos públicos do harness.
3. Mover deploy/demos/docs e separar gates. Referências históricas a paths movidos recebem mapeamento explícito e restrito no checker de links, sem reescrever evidências nem criar wrappers no worker genérico que importem o produto.
4. Verificar em snapshot limpo da fatia e em variante sem o produto. A ausência do workspace exige manifesto/lockfile adequados à variante, não simplesmente apagar arquivos e chamar `npm ci` com o lock antigo.
5. Em falha, interromper integração e reverter apenas commits/patches próprios em branch/snapshot, preservando claims e dados alheios. Volumes existentes não são movidos ou apagados; mudanças de formato precisam de procedimento específico.

Um build que depende de `paths` para atravessar fontes privadas não comprova consumo público. HISO-009 testa os exports/builds efetivos. A interface de modelo usada pelo assistente deve ser explicitamente suportada; não montar runtime completo de tools quando a necessidade é somente organizar JSON.

## Tratamento dos achados da auditoria

[0370](0370_harness_product_isolation_backlog.md) encaminha todos os F01–F14. O harness assume transporte de modelo (F14), dependências compartilhadas (F12) e a parte estrutural/documental de F13. O consumidor assume F01–F11 e seu deploy/CI/guia. A divisão não fecha achados: exige evidência no pacote e candidato corretos.

HISO-014 encerra isolamento/qualidade do escopo compartilhado; não espera contrato jurídico, dez áudios de homologação ou piloto de duas semanas. PISO-010 depende dessas provas próprias do produto. HIS read-only, rotinas/escalonamento e novas portas continuam nas fases futuras do consumidor.

## Próxima ação e continuidade

**HISO-001: congelar baseline da fronteira e revalidar owners/claims para a primeira fatia.** Depois, HISO-002/003 reconciliam os ponteiros e fixam a SPEC curta. Cartões do backlog continuam pendentes de execução; a task documental desta rodada não os marca concluídos.

Ledgers 99/20/30 e README/índice estão modificados por outras rodadas. A direção atual e as entradas prontas para integração ficam no [handoff](../08_runtime/handoffs/harness_isolation_plan_20261003.md) e no claim desta rodada. Nenhum código, volume, processo existente ou gate de release foi alterado aqui.


Atualização GREEN/R9 (04/10/2026): a suíte completa com PostgreSQL passou com 3.505 testes em 372 arquivos, zero failures/skips, cobertura S91,81/B87,20/F94,88/L92,86 e gate crítico PASS. Essa execução antecede a integração OPS-R4 e não certifica o novo candidato. Seis arquivos de identidade histórica de recibos foram integrados por SHA; Builder registrou 600 testes distintos PASS e controles de bundle rejeitando callbacks de outra conta/provider sem evento novo. Crítica nova I1 em execução, CI-R3 corrige seis validators; inventário mantém 371 arquivos originais, nove novos e 276 paths canônicos. Gauntlet formal tem duas rodadas, FIX_RETEST, evidência global não qualificada; vinte e quatro critérios e NO_GO preservados. Segurança e bootstrap de produção aguardam revisão explícita das emendas concretas; zero chamadas de modelo. Evidência própria: checkpoint-16-full-suite-pass-and-receipt-integration.json. Ledgers 99/20/30 alheios permanecem preservados, integração pendente.
