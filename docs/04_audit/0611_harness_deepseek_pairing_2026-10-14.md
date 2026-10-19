# AUD0611 — Pareamento do motor CVG com o DeepSeek instalado

- Data: 14/10/2026. Agente: Codex. Task: `AUD0611-PAIRING-20261014`, T1/AUDIT.
- Pedido: inspecionar os dois programas locais e avaliar quanto o CVG avançou como motor reutilizável dos programas do Centro Veterinário Guarapiranga.
- Escopo: código atual, instalação efetivamente selecionada pelo launcher, composição dos consumidores, testes sintéticos existentes e inventário dos containers. Sem BUILD, mudança de implementação ou operação produtiva.
- Direção: [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md), [ADR-011](../architecture/adrs/ADR-011-kernel-de-plugins-com-controles-obrigatorios.md) e [plano 0375](../03_build/0375_plano_pareamento_motor_dsh.md).
- Evidências atuais: [resumo](evidence/AUD0611-PAIRING-20261014/summary.md), [verificações](evidence/AUD0611-PAIRING-20261014/checks.json), [testes](evidence/AUD0611-PAIRING-20261014/focused-tests.log) e [identidade](evidence/AUD0611-PAIRING-20261014/identity.json).

## Resultado

**O pareamento arquitetural e funcional do motor está em aproximadamente 70%, com faixa de julgamento de 65–75%.** A rubrica abaixo resulta em 71,5/100; o número arredondado comunica a incerteza de uma avaliação por capacidades, sem sugerir precisão de benchmark. O CVG já implementa boa parte dos princípios centrais do DeepSeek: composição por plugins, pipeline governado, controles antes de efeitos, ferramentas contidas, eventos de sessão e integração por API pública.

O estágio é de **motor governado implementado e verificado em cenários sintéticos, com convergência parcial e integração aos consumidores ainda incompleta**. A nota avalia a aproximação ao desenho e às capacidades da referência. Não mede qualidade global, compatibilidade de protocolo, taxa de sucesso hospitalar ou prontidão de produção.

O baseline de aproximadamente 50% no plano 0375 é histórico, de 11/10. Ele não representa mais o código atual. Como o plano não publica os pesos daquele cálculo, a diferença entre 50 e esta avaliação não é uma série quantitativa com metodologia idêntica. Existe, porém, avanço concreto nos sete grupos de implementação examinados.

## Referências efetivamente comparadas

| Alvo                              | Identidade observada                                                                                                                                | Limite                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| CVG no workspace                  | HEAD `ca565391ac52033d6f59b06237a45beb986e1c12`; árvore inicialmente limpa                                                                          | Código atual e testes existentes; nenhuma alteração de implementação nesta auditoria                                           |
| DeepSeek usado pelo comando `dsh` | `/home/ricardo/deepseek-harness-session-fixes`, HEAD `768fb1f3d3dcf9a16659ee354e927d05475f22dd`, árvore limpa; `dsh --version` retorna `0.2.0-rc.1` | Launcher chama `apps/cli/lib/bin.js`; o caso especial `dsh web` usa um launcher de janela separado, não executado aqui         |
| Outro clone DeepSeek              | `/home/ricardo/deepseek-harness`, HEAD `280156b0a9baf286bc6bff2157ada1fd0fdbccf8`, manifesto `0.1.7-rc.2`                                           | É a referência histórica da ADR-011, mas não é o destino atual do comando `dsh`                                                |
| Containers locais CVG             | Dois containers `cvg-harness-local-20261006-*`, ambos `exited`, tags `cvg-harness-local-{web,runtime}:31dc1c3`                                      | Não demonstram operação das implementações recentes do workspace; a tag não constitui prova do SHA de todos os bytes da imagem |

A versão `0.2.1-alpha.2` citada no plano 0375 também não é a versão retornada pelo launcher inspecionado. Esta avaliação fixa o alvo local efetivo, sem consultar ou atualizar a versão remota. A disponibilidade de um repo completo permitiu inspecionar fontes e artefato CLI diretamente; não houve necessidade de decompilação.

## Rubrica do motor

Escala de julgamento: 0 = capacidade ausente; 25 = intenção ou infraestrutura inicial; 50 = capacidade parcial; 75 = núcleo equivalente com lacunas materiais de integração ou alcance; 100 = equivalência demonstrada para o escopo comparado. As notas intermediárias sintetizam os fatos da última coluna. Os pesos priorizam execução e governança para o uso institucional pedido. UI não entra no denominador do motor.

| Dimensão               | Peso     | Nota     | Evidência e diferença restante                                                                                                                                                                     |
| ---------------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composição por plugins | 15%      | 80       | `KernelHost`, serviços declarados, dependências, hooks e disposers reais. CVG sela o host e mantém controles obrigatórios; DeepSeek usa composição configurável Cordis, incluindo o próprio loop   |
| Pipeline de execução   | 20%      | 70       | Single-pass, iterativo e `GovernedAgentRuntime` usam primitivas de `kernel/pipeline.ts`. `CONTROLLED_RUNTIME` da plataforma ainda é um caminho distinto, registrado em PDSH-003b                   |
| Governança dos efeitos | 20%      | 90       | Policy, aprovação vinculada, journal durável, RLS e auditoria por hash estão implementados. Integração uniforme em todos os consumidores ainda não foi demonstrada                                 |
| Sessão e contexto      | 10%      | 70       | Store append-only, sequência, fingerprints, catálogo v1 e mecanismo de migração adjacente. Compactação funciona como plugin, mas é simples e não está consumida pelo produto de plantão            |
| Camada de modelo       | 10%      | 70       | Gateway, budgets, retry, circuito, prompts e medidor de usage. Medidor do CVG agrega usage bem-sucedida; DeepSeek também reconstrói pressão de contexto, superfícies e projeções da sessão         |
| Ferramentas e skills   | 10%      | 60       | Sete ferramentas catalogadas, skill carregável e fs/shell/egress implementados. O alcance é menor que o conjunto DeepSeek de MCP, browser/computer use, subagentes, PTC e ferramentas persistentes |
| SDK de integradores    | 5%       | 50       | JSON-RPC v1, cliente TypeScript, composições completa/mínima e exemplo. Transporte fornecido é em processo; sem servidor stdio/HTTP ou SDK Python equivalente entregue                             |
| Engenharia e provas    | 5%       | 60       | Conformidade atual verde; gate per-file existe para quatro pacotes. Replay de sessões e integração dos novos gates ao CI estão TODO; fechamento PDSH-031 pendente                                  |
| Sandbox e contenção    | 5%       | 40       | Bubblewrap executa processos e ferramentas validam paths. Landlock é inferido da versão do kernel, sem probe de ABI ou aplicação de ruleset encontrados; diverge da SPEC 0196                      |
| **Total ponderado**    | **100%** | **71,5** | **Comunicar como aproximadamente 70%; faixa de julgamento 65–75%**                                                                                                                                 |

As diferenças deliberadas da ADR-011 não são defeitos por si: controles obrigatórios, loop do kernel e persistência institucional do CVG são escolhas coerentes com seu uso. Elas impedem, porém, declarar equivalência completa com um ecossistema Cordis livremente configurável. Nenhum manifesto examinado do CVG depende de DeepSeek ou Cordis. Os formatos CVG v1 e DeepSeek v4 e seus SDKs têm contratos próprios; não existe prova de interoperabilidade ou de plugins DeepSeek utilizáveis diretamente no CVG.

## O que já existe de forma concreta

O [host](../../packages/harness/src/kernel/host.ts) valida serviços, ordem de dependências e perfis; os [hooks e serviços](../../packages/harness/src/kernel/types.ts) distinguem controle de capacidade. [Single-pass](../../packages/harness/src/runtime.ts) é fachada do kernel. Iterativo e o [bridge do agent-runtime](../../packages/agent-runtime/src/runtime-kernel-bridge.ts) usam as mesmas funções de modelo e ferramenta. Os testes atuais de conformidade e arquitetura corroboram esse encaminhamento nos perfis examinados.

O [catálogo de ferramentas](../architecture/TOOL_CATALOG.md) enumera `fs.read`, `fs.list`, `fs.write`, `fs.edit`, `shell.run`, `exam.download` e `exam.upload`; uma skill `exam-intake` é carregável por manifesto. Os testes de shell usam execução contida e cenários sintéticos, e o egress é exercitado com transports de teste. Isso confirma implementação, sem afirmar homologação de um canal institucional externo.

O [formato de sessão](../../packages/contracts/src/session-events.ts) contém nove tipos de eventos, com catálogo e fingerprints; o [store PostgreSQL](../../packages/persistence/src/session-events.ts) e a [migração SQL](../../packages/persistence/migrations/0028_session_events.sql) implementam sequência e proteção por tenant. A [evolução de formatos](../../packages/harness/src/session/format-migration.ts) cria visões derivadas; apenas v1 é geração real entregue. Os testes de v2/v3 são sintéticos e não significam migração histórica hospitalar demonstrada.

O [SDK](../../packages/sdk/src/composition.ts) fornece `createSdk`/`createSdkMinimal`, negociação e operações de sessão/turno. O [medidor de tokens](../../packages/model-gateway/src/token-meter.ts) aceita usage válida e o [gateway](../../packages/model-gateway/src/gateway.ts) pode alimentá-lo. A [compactação](../../packages/harness/src/compaction.ts) gera resumo determinístico e integra o ponto anterior ao modelo.

## Lacunas que limitam a conclusão

1. **Unificação ainda parcial.** [Execução publicada](../../packages/agent-core/src/commands/execute-published-agent.ts) delega a `executeConfiguredAgent` na [plataforma](../../packages/platform/src/test-lab.ts), fora do kernel governado. PDSH-003b continua TODO. Passar na conformidade dos três perfis governados não demonstra um único pipeline para todos os caminhos da aplicação.
2. **Consumo hospitalar incompleto.** O [organizador de plantão](../../products/shift-assistant/src/organizer.ts) chama `ModelProvider.execute` diretamente. Não compõe `createOperationalHarness`, SDK, sessão ou compactação novos. PDSH-026 está DEFERRED. O [worker neutro](../../apps/worker/src/operational-harness-worker.ts) permanece controlado, com modelo determinístico e ferramentas sintéticas na composição padrão. Nenhuma prova atual demonstra todos os programas do CVG usando esse motor.
3. **SDK entregue é em processo.** A [SPEC 0204](../02_spec/0204_pdsh023_sdk.md) exclui stdio/HTTP e autenticação e entrega `createInProcessTransport`. O plano lista SDK out-of-process como meta; o cartão DONE_LOCAL não prova essa meta ampliada. DeepSeek oferece cliente que inicia subprocesso, servidor stdio e cliente Python. É uma lacuna de alcance e rastreabilidade, sem reclassificar retroativamente o aceite local da SPEC reduzida.
4. **Landlock prometido não corresponde ao código observado.** A [SPEC 0196](../02_spec/0196_pdsh011_sandbox_local.md) descreve probe de ABI por syscall e restrição real de filesystem. [Capabilities](../../packages/sandbox/src/capabilities.ts) usa `os.release()` e kernel ≥5.13 como sinal; o [gate](../../packages/sandbox/src/gate.ts) consulta esse booleano. Não foi encontrado uso de `landlock_create_ruleset`/`landlock_restrict_self`, addon ou runner Landlock nos módulos do pacote. `requireLandlock` portanto não demonstra ruleset aplicado. Bubblewrap e allowlist continuam reais; a auditoria não executou exploração nem prova adversarial de isolamento.
5. **Compactação e metering têm alcance menor.** O resumo CVG é formado por excertos curtos e digest, com estimativa de quatro caracteres por token. DeepSeek tem resumo automático, comando manual, pruning de resultados, tratamento de imagens e projeções de pressão reconstruídas da sessão. Equivalência do nome da capacidade não prova retenção de informação em conversas longas de plantão.
6. **Barra de qualidade ainda não fechada.** PDSH-031 está IN_PROGRESS, PDSH-032/033 TODO. A inspeção de `verify.yml` e `scripts/ci-bar*.mjs` não encontrou ativação de `CVG_COVERAGE_PER_FILE` nem os dois novos catálogos. Esta rodada não fechou esses cartões.
7. **Threshold documental divergente.** No [Vitest config](../../vitest.config.mts), `CVG_COVERAGE_PER_FILE=1` seleciona thresholds globais de zero e globs de 100% para quatro pacotes, com `perFile: true`. Portanto esse modo não conserva sozinho os agregados 90/85/90/90 dos demais arquivos, apesar da redação de [0610](0610_pdsh031_per_file_justifications_2026-10-12.md). A lógica de `resolveThresholds`/`checkThresholds` do Vitest instalado confirma a interpretação. O resultado histórico pode atingir números agregados altos sem existir gate ativo que os imponha nesse modo.

O documento 0610 registra 47 regiões `v8 ignore` e exclusões de suporte e adaptadores. Isso precisa permanecer visível na interpretação de “100%”: é o denominador configurado de quatro pacotes, com exceções documentadas, não o sistema inteiro. O log histórico de 3.249 testes e coverage de 12/10 não foi reemitido nesta auditoria.

## Evidência executada nesta rodada

- Node 22.23.2: **46 arquivos e 525 testes PASS, sem skips reportados**, em 35,46 s. Inclui testes PDSH disponíveis fora de PostgreSQL, conformidade, arquitetura, SDK e superfície pública; comando integral preservado em [command.json](evidence/AUD0611-PAIRING-20261014/command.json).
- Catálogo de tools/skills: PASS, sete ferramentas e uma skill. Catálogo de sessão: PASS, nove tipos de eventos.
- Fronteira de produto: PASS; 1.239 arquivos de fonte, 878 core; zero violações, diagnósticos e drift de lock instalado. Exceções do próprio checker seguem no [log bruto](evidence/AUD0611-PAIRING-20261014/product-boundary.log).
- 606 arquivos de implementação/configuração/testes selecionados tiveram hashes iguais antes e depois dos testes e checks. [Integridade](evidence/AUD0611-PAIRING-20261014/source-integrity.json).
- Launcher DeepSeek: `--version` PASS; inventário Docker somente leitura, sem iniciar ou parar processos.

A mensagem `TOOL_CATALOG.md is stale` no meio do log de testes pertence ao teste negativo de drift, que altera e restaura o catálogo. Os testes passaram e o check direto posterior confirmou catálogo atualizado.

Não foram executados suíte integral, coverage atual, PostgreSQL, E2E, certify, SBOM, licenses, chamadas a provider, carga ou jornadas hospitalares reais. A inspeção não certifica performance, produção ou isolamento completo. É uma avaliação realizada por este agente, não aceite independente de release. O próprio `SAFETY.md` local do DeepSeek classifica a referência como experimental; pareamento não transfere certificação.

## Continuidade

Dos 23 cartões PDSH, 12 estão DONE, seis DONE_LOCAL, um IN_PROGRESS, três TODO e um DEFERRED. Isso representa 18 entregas registradas ao menos localmente; **não é uma porcentagem de paridade funcional**. Os status pertencem ao plano 0375 e foram preservados.

Próxima ação operacional existente: fechar PDSH-031 com PostgreSQL descartável, E2E e ledgers, usando claims próprios. Depois, PDSH-032/033 fecham replay e CI; PDSH-003b e PDSH-026 endereçam encaminhamento e consumo. As lacunas adicionais de SDK externo, Landlock e thresholds ficam registradas no [backlog mestre](../30_backlog_master.md), sem iniciar BUILD.

Veredito para o pedido: o CVG já é uma base concreta para construir consumidores institucionais e alcançou boa convergência com o motor de referência. Ainda falta provar composição uniforme e integração dos produtos, completar os gates e reconciliar os contratos de contenção. Estado do programa permanece **PRODUCTION_NO_GO**.
