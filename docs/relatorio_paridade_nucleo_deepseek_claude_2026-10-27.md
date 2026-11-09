# Paridade do núcleo com DeepSeek Harness e Claude Code

Data de referência: 27/10/2026. Relatório solicitado por Ricardo após o alinhamento de que o objetivo principal é construir e validar o núcleo, kernel e runtime do CVG Operational Harness. A camada de produto é uma aplicação de teste e validação desse núcleo.

**O CVG avançou na integração do kernel, no SDK externo e na qualidade das provas. Sua aproximação arquitetural ao motor DeepSeek está em torno de 75/100 neste recorte documental. A equivalência funcional completa com DeepSeek ou Claude Code ainda não foi demonstrada.**

Para Claude Code, a inspeção encontra fundamentos parciais em nove das 16 famílias do catálogo; sete não têm o caminho completo demonstrado na main examinada. Isso não significa 9/16 de paridade: nenhuma família recebeu aceite integral nesta rodada. O catálogo publicado continua registrando zero de 117 resultados funcionais qualificados.

**O que está sendo medido**

O foco é composição do kernel, execução governada, efeitos, sessão, contexto, modelos, ferramentas, SDK e contenção. Login visual, telas, experiência do Assistente, servidor hospitalar e piloto não compõem a nota arquitetural do motor. Autorização reutilizável, auditoria e isolamento permanecem relevantes ao núcleo. As superfícies de operação de agentes, como MCP, sessões e supervisão, são capacidades de runtime/host; não se confundem com a interface do Assistente.

| Medida                                                 | Resultado deste relatório                                                      | Como interpretar                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Aproximação arquitetural do motor ao DeepSeek          | Aproximadamente **75/100**; cálculo documental 76,5; faixa de julgamento 70–80 | Avaliação técnica de nove dimensões, com os pesos da AUD0611; não é percentual de funcionalidades aceitas                       |
| Paridade DeepSeek no catálogo amplo de 266 capacidades | **NOT_MEASURED** na carteira publicada examinada                               | O medidor PAR-Q05 continua pendente; o levantamento histórico de cerca de 18% não foi recalculado capacidade por capacidade     |
| Paridade funcional Claude no catálogo publicado        | **0/117 qualificados registrados**; 134 requisitos ainda com `NOT_RUN`         | Falta de qualificação formal nessa medida, apesar de código e fundações existentes; há 17 controles CVG adicionais obrigatórios |
| Presença de fundamentos nas famílias Claude            | **9 parciais; 7 sem caminho completo demonstrado**                             | Classificação desta inspeção; não concede crédito parcial no medidor oficial                                                    |

Os programas originais conservam seus denominadores. Este recorte do núcleo não exclui silenciosamente requisitos nem redefine o que significaria concluir 100% de cada programa.

**Versões comparadas e método**

- CVG publicado: main `61e5cf8f41d15cc41ad524f8a57476d4f6080131`, confirmada pelo conector GitHub; foram preservadas 30 cópias de fonte/documentação dessa revisão para a inspeção dirigida.
- Checkout compartilhado: `3704e3f85`, anterior à main publicada. Não foi usado como se fosse a implementação mais recente.
- DeepSeek: referência fixada `0.2.0-rc.1`, commit `768fb1f3d3dcf9a16659ee354e927d05475f22dd`, recuperada dos objetos Git locais de `/home/ricardo/deepseek-harness`. Foram preservados oito arquivos de referência. O HEAD atual desse clone é outro e não moveu o alvo da comparação.
- Claude: referência do catálogo `2.1.302`, SHA-256 `60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5`. A investigação posterior da versão 2.1.308 está registrada como delta e não substitui automaticamente essa referência.

A rodada compara fonte imutável, contratos e resultados anteriores identificados. Não executou modelos, novos agentes, suíte de testes ou certificação. Os resultados de execução citados pertencem aos respectivos pacotes anteriores; não recebem frescor por aparecerem neste relatório. Trata-se de avaliação documental do autor, sem nova revisão independente de paridade.

**Pareamento com o motor DeepSeek**

A [AUD0611 de 14/10](04_audit/0611_harness_deepseek_pairing_2026-10-14.md) atribuía 71,5/100, comunicado como aproximadamente 70%, ao motor. Aplicando os mesmos pesos à fonte publicada examinada, a leitura documental resulta em 76,5/100, comunicado como aproximadamente 75%. A faixa 70–80 expressa julgamento, não intervalo estatístico. A diferença não constitui uma medição experimental de cinco pontos de avanço: a auditoria antiga incluía execução de testes e esta rodada é estática.

| Dimensão               | Peso | Nota em 14/10 | Leitura documental em 27/10 | Evidência e limite                                                                                                                                                                     |
| ---------------------- | ---: | ------------: | --------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composição por plugins |  15% |            80 |                          80 | Host com dependências, serviços, hooks, rollback e selagem; lifecycle dinâmico completo ainda não demonstrado                                                                          |
| Pipeline de execução   |  20% |            70 |                          85 | `test-lab.ts` encaminha para `executeControlledKernel`, que compõe `createOperationalHarness`; recuperação durável e aceite de todos os perfis continuam sujeitos aos cartões próprios |
| Governança dos efeitos |  20% |            90 |                          90 | Policy, approval, journal e auditoria presentes; não há prova de aplicação uniforme em todo consumidor ou caminho futuro                                                               |
| Sessão e contexto      |  10% |            70 |                          70 | Eventos e persistência existem; SDK ainda inicia contexto vazio e estado versão zero por turno, sem provar resume/fork completo                                                        |
| Camada de modelo       |  10% |            70 |                          70 | Gateway, orçamento, retry, circuito e usage; provider observado mantém `stream: false`                                                                                                 |
| Ferramentas e skills   |  10% |            60 |                          60 | Ferramentas e loader disponíveis; loader usa `skill.json`, com lacunas de descoberta progressiva, MCP e catálogo ampliado                                                              |
| SDK de integradores    |   5% |            50 |                          75 | Transporte stdio TS e cliente Python agora publicados; faltam o alcance de notificações, streaming e API de alto nível da referência                                                   |
| Engenharia e provas    |   5% |            60 |                          75 | Validação agregada de cobertura, evidência por produtor e suporte a testes diferenciais; medidor e gates de paridade integral seguem pendentes                                         |
| Sandbox e contenção    |   5% |            40 |                          40 | Bubblewrap e validações existentes; Landlock continua inferido pela versão do kernel, sem ruleset nativo aplicado demonstrado                                                          |
| Total ponderado        | 100% |          71,5 |                        76,5 | Aproximação do desenho do motor; não aprovação de interoperabilidade ou produção                                                                                                       |

As principais melhorias publicadas são verificáveis nos arquivos:

- Encaminhamento da execução: [test-lab](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/packages/platform/src/test-lab.ts) e [adaptador do kernel](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/packages/platform/src/controlled-kernel-execution.ts).
- Integração externa: [stdio TS](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/packages/sdk/src/stdio.ts) e [stdio Python](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/packages/sdk/python/cvg_sdk/stdio.py).
- Provas de qualidade: [runner de cobertura](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/scripts/run-core-coverage.mjs) e [validador agregado](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/scripts/coverage-thresholds.mjs).

O DeepSeek fixado possui SDK de alto nível, MCP e infraestrutura de subagentes mais ampla. O CVG adota controles obrigatórios e persistência institucional como escolhas próprias. A nota de governança reconhece implementação do CVG; não afirma superioridade universal nem garante que as duas plataformas aceitem os mesmos plugins ou protocolos.

**Por que 75 do motor e 18 histórico não se contradizem**

Os cerca de 18% do [roadmap0379](03_build/0379_roadmap_paridade_100_deepseek.md) vieram de um levantamento de 266 capacidades em 16/10: nove presentes, 76 parciais, 175 ausentes e seis divergentes ou não aplicáveis. A conta indicativa atribuía meio crédito às parciais. Ela inclui ferramentas, orquestração, SDK, hosts e interação além do pequeno kernel.

A nota do motor usa nove dimensões ponderadas, dando mais peso a execução e governança. São perguntas e denominadores diferentes. Não se deve atualizar os 18% adicionando testes aprovados, nem converter a nota arquitetural em capacidades `PASS_CURRENT`.

**Pareamento com Claude Code**

O [plano0381](03_build/0381_plano_executivo_paridade_claude_code.md) define 117 resultados funcionais comparáveis e 17 controles adicionais do CVG, distribuídos em 16 famílias. A [cópia do catálogo da main](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/docs/03_build/tracking/claude100_catalog_v1.json) ainda registra `numerator_pass_current: 0`, referência funcional `NOT_RUN` nos 117 resultados e evidência `NOT_RUN` nos 134 requisitos. Isso descreve o registro publicado, não uma ausência total de implementação.

| Família                | Leitura da main examinada        | Diferença que impede equivalência completa                                                                     |
| ---------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Hooks                  | Fundação parcial                 | Seis pontos internos no kernel; lifecycle externo, handlers e escopos Claude não completos                     |
| Subagentes             | Caminho completo não demonstrado | Falta supervisor com spawn/fork, autoridade herdada e cancelamento da árvore                                   |
| Sessões                | Fundação parcial                 | Eventos persistentes não equivalem a seleção, retomada e fork público completos                                |
| MCP                    | Caminho completo não demonstrado | A origem `mcp` existe no contrato; isso não implementa cliente/servidor e transportes                          |
| Skills/plugins         | Fundação parcial                 | Loader/registry presentes; `SKILL.md`, discovery leve e corpo sob demanda ainda incompletos                    |
| Contexto/memória       | Fundação parcial                 | Há compactação determinística; falta demonstrar preservação de obrigações e memória revisável com proveniência |
| Headless/stream/schema | Fundação parcial                 | SDK/stdin/stdout presentes; streaming incremental e diálogo completo com host ainda incompletos                |
| Planejamento           | Caminho completo não demonstrado | Plano interno de execução não equivale a plano revisável e todos públicos com transição governada              |
| Contenção              | Fundação parcial                 | Controles locais existentes, com lacunas de prova nativa e perfis completos                                    |
| Budget/modelos         | Fundação parcial                 | Há limites e metering; custo agregado durável de filhos e reservas concorrentes ainda não demonstrados         |
| Background             | Caminho completo não demonstrado | Falta ciclo público start/list/attach/logs/stop/respawn com ownership                                          |
| Workspaces             | Caminho completo não demonstrado | Roots de ferramentas não equivalem a worktrees gerenciadas por tarefa e terminal próprio                       |
| Rewind                 | Caminho completo não demonstrado | Checkpoint de execução não é restauração seletiva de arquivos com detecção de conflito                         |
| Configuração           | Fundação parcial                 | Schemas e perfis existem; origens efetivas, precedência e snapshot ligado à retomada ainda incompletos         |
| Evals                  | Fundação parcial                 | Runner/métricas presentes; avaliação pareada com/sem extensão e promoção completa não demonstradas             |
| Remoto/IDE/gateway     | Caminho completo não demonstrado | API e console não demonstram as jornadas cloud, controle remoto ou IDE do catálogo                             |

As nove fundações parciais não valem 56% de paridade. A regra aprovada não concede meio crédito a essas famílias. Também não seria correto inventar uma nota Claude equivalente aos 75 do motor DeepSeek: não existe uma rubrica arquitetural Claude anterior com os mesmos pesos e oráculos funcionais completos.

Os exemplos de lacunas foram confrontados com fonte: [host e hooks](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/packages/harness/src/kernel/host.ts), [servidor SDK](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/packages/sdk/src/server.ts), [loader de skills](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/packages/harness/src/skills/loader.ts), [compactação](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/packages/harness/src/compaction.ts), [provider](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/packages/model-gateway/src/providers/openai-compatible.ts), [capabilities do sandbox](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/packages/sandbox/src/capabilities.ts) e [eval runner](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/packages/agent-evals/src/runner.ts). Ausência de um nome em busca de código foi usada como apoio, não como prova isolada de inexistência em todas as candidatas.

**Melhorias de qualificação que não devem ser confundidas com novas capacidades**

O programa Claude avançou na preparação de comparações reais:

- A [SPEC0235](04_audit/evidence/CLAUDE100-EXEC-20261017/spec0235-runtime/REPORT.md) registrou uma execução nativa do Claude2.1.302 em endpoint sintético503, com 13 controles e auditoria independente de163 verificações; o pacote declara expressamente que isso não concede M1 ou crédito funcional.
- O [servidor de falhas Q04](04_audit/evidence/CLAUDE100-EXEC-20261017/q04/REPORT.md) foi integrado e cobre HTTP sintético,429,timeout,desconexão,JSON inválido e chunks. Chunks no suporte de teste não provam streaming no runtime do agente.
- A [captura r5](04_audit/evidence/CLAUDE100-EXEC-20261017/ref-capture-build/r5-run/state.json) registrou TEXT,READ e WRITE_DENIED no cliente real sob o perfil aprovado. A captura de READ é numerada pelo cliente e não é, sozinha, um `READ_PASS` comparativo do CVG. O pacote não concede M1 ou `PASS_CURRENT`.
- A [investigação2.1.308](04_audit/evidence/REA-CLAUDE-20261022/version-delta.json) identificou diferenças aproveitáveis; a [matriz de propostas](04_audit/evidence/REA-CLAUDE-20261022/improvement-matrix.json) distingue propostas de implementação.

As melhorias CI0261/N1 em construção em27/10 fortalecem a autenticidade e a atribuição das provas. Elas não foram adicionadas à nota da main61e5 como funcionalidades já integradas, nem transformam testes focais em paridade de agentes. Candidatas privadas de journal/lifecycle/sessão conservam seus aceites e pendências próprios.

**Próximos marcos de maior valor para o núcleo**

1. Consolidar a cadeia pública de execução e a recuperação durável, com uma candidata fixa e controles negativos que discriminem bypass, duplicação e estado incerto.
2. Demonstrar a jornada M1 do núcleo: abrir sessão, ler, reter escrita para approval, aprovar, retomar e reiniciar sem repetir efeito. Usar a aplicação apenas onde ela fornece evidência útil dessa jornada.
3. Completar continuidade de sessão, contexto e streaming. Fechar reserva/custo agregado antes de acrescentar filhos autônomos.
4. Conectar skills progressivas, hooks e MCP ao mesmo kernel governado; depois supervisor de subagentes/background com autoridade limitada.
5. Publicar os medidores vinculados aos catálogos e às provas de cada capacidade. Só então atualizar percentuais funcionais de forma reproduzível, sem reduzir os alvos originais.

Esses marcos indicam a ordem técnica de dependências; os cartões existentes, responsáveis, gates e decisões humanas continuam canônicos. Não há nova autorização de BUILD, cancelamento de backlog, aceite de isolamento ou liberação de produção neste relatório.

**Evidências e limites para consulta futura**

- [Critérios congelados desta avaliação](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/quality-bar.json).
- [Cálculos, classificação e hashes das fontes documentais](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/assessment.json).
- [Manifesto dos30 arquivos da main](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-manifest.json) e [manifesto dos oito arquivos DeepSeek](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/reference-manifest.json).
- [Main examinada](https://github.com/ricardoakinaga-dev/cvg-operational-harness/commit/61e5cf8f41d15cc41ad524f8a57476d4f6080131), [backlog DeepSeek publicado examinado](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/docs/03_build/0380_backlog_paridade_100_deepseek.md.source.txt) e [backlog Claude publicado examinado](04_audit/evidence/PARIDADE-NUCLEO-20261027-CODEX-81C4/source-main/docs/03_build/0383_backlog_paridade_claude_code.md.source.txt).

Os arquivos vinculados fora do packet podem evoluir. Os hashes preservam a identidade do material usado. A inspeção é dirigida, não revisão linha a linha do repositório inteiro; não reexecuta os117 resultados Claude nem as266 capacidades DeepSeek. O próximo número funcional confiável depende das provas comparativas por capacidade na mesma candidata, e não de uma nova média de testes ou cartões.
