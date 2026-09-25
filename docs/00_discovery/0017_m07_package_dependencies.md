# 0017 — Discovery: dependências e manifests de packages (M07)

Data: 23/09/2026  
Task: `M07` / P1-S1  
Status: `DISCOVERY_COMPLETE / WAITING_HUMAN_APPROVAL_FOR_DISCOVERY_GATE`  
Escopo: inspeção estática do worktree; sem alteração de runtime.

## Problema e resultado esperado

O workspace tem packages novos e módulos legados de produto. Antes de corrigir manifests ou importar código entre fronteiras, os mantenedores e consumidores precisam saber quais dependências o código observado usa, quais dependências os manifests declaram e em que pontos a arquitetura atual difere da fronteira neutra planejada.

Ao fim de M07, cada dependência usada deve estar declarada no package proprietário, os packages que são públicos devem resolver pelos exports públicos pertinentes, e a direção proibida pelo contrato neutro deve ser verificada. Exceções legadas precisam de owner, justificativa e prazo. Um import observado, por si só, não prova defeito nem autoriza refactor.

## Usuários e valor

- Mantenedores de `apps/*` e `packages/*`: localizar manifests, referências de projeto e limites de compilação a corrigir.
- Consumidores do Harness: saber quais entradas são públicas e quais imports continuam internos.
- Revisores: distinguir o grafo de produto legado do subgrafo neutro do Harness e avaliar compatibilidade sem inferir que um gate histórico cobre M07.

## Escopo da descoberta

Incluídos: os 25 diretórios workspace (3 apps e 22 packages), imports estáticos, `package.json`, `exports`, `tsconfig.json`, referências de projeto, aliases do TypeScript e scripts de build do root. Imports de produção e de teste foram classificados separadamente. Foram considerados os mapas de arquitetura, as decisões de classificação e o pacote P1-S1.

Excluídos: alterações de código/manifests, builds isolados, typecheck, lint, testes, migrações, mudanças de API pública, execução de serviço, rede, integração externa, dados reais e qualquer ação sensível. Nenhum desses checks foi executado nesta descoberta.

## Método e proveniência

Foi feita leitura estática dos arquivos no worktree observado, incluindo código de teste, usando parser AST do TypeScript 6.0.3. A contagem foi de 813 arquivos TypeScript/JavaScript elegíveis e zero erros de parse. Os resultados refletem o worktree que já continha alterações preexistentes; não representam um checkout limpo de `HEAD` (`05d1f33`). Não foram executados testes, builds, typecheck ou lint.

Os documentos de arquitetura consultados incluem [`PACKAGE_MAP.md`](../architecture/PACKAGE_MAP.md), [`PACKAGE_CLASSIFICATION.md`](../refoundation/PACKAGE_CLASSIFICATION.md), [`PHASE_1_DECISIONS.md`](../architecture/PHASE_1_DECISIONS.md), [`PUBLIC_API.md`](../architecture/PUBLIC_API.md), [`CURRENT_VS_TARGET.md`](../architecture/CURRENT_VS_TARGET.md), [`PHASE_0_1_REPORT.md`](../refoundation/PHASE_0_1_REPORT.md) e [`SCOUT_PACKAGE_BOUNDARY.md`](../refoundation/SCOUT_PACKAGE_BOUNDARY.md). Os specs legados [`0103`](../02_spec/0103_mapa_de_modulos.md) e [`0116`](../02_spec/0116_matriz_de_dependencias.md) divergem em arestas do grafo; não foram usados para declarar o estado atual. A matriz abaixo vem da leitura de imports no worktree.

## Inventário observado

| Item                               | Observação estática                                                                                                                                                                                                          | Interpretação nesta etapa                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Workspace                          | 25 diretórios: 3 apps e 22 packages; todos têm `package.json` e `tsconfig.json`                                                                                                                                              | Cobertura do inventário; não comprova build individual                        |
| Dependências `@cvg/*` declaradas   | 75 pares diretos declarados nos manifests                                                                                                                                                                                    | Inclui declarações sem import estático observado                              |
| Imports bare `@cvg/*`              | 70 pares owner→package distintos no conjunto de arquivos; nenhum par bare interno sem declaração correspondente foi observado                                                                                                | Não cobre resolução dinâmica ou dependência opcional fora do padrão analisado |
| Declarações sem import estático    | `agent-runtime → channel-gateway`, `chaos → shared`, `memory → shared`, `tools → policy`, `workflows → tools`                                                                                                                | Observação, não recomendação de remoção                                       |
| `exports`                          | 6 packages sem campo (`adapters`, `agent-evals`, `chaos`, `memory`, `tools`, `workflows`); os outros 16 dos 22 packages exportam apenas a raiz; 15 apontam para `dist`, enquanto `conversation` aponta para TypeScript fonte | Decidir intencionalidade e alvo por package; não adicionar exports em massa   |
| Imports de subpath privado         | Nenhum `@cvg/package/subpath` foi observado                                                                                                                                                                                  | Não prova compatibilidade de todos os consumidores                            |
| Aliases TS                         | `tsconfig.base.json` mapeia raízes dos packages para `packages/*/src/index.ts`                                                                                                                                               | O typecheck pelo alias não prova resolução pelo `exports` publicado           |
| Scripts                            | Nenhum package-local possui scripts; `build:harness` do root cobre `shared`, `contracts`, `orchestrator`, `approval-engine` e `harness`; `build` do root executa typecheck e web build                                       | Builds isolados continuam pendentes e precisam de gate próprio                |
| Imports relativos entre workspaces | 9 ocorrências, todas em testes: 3 de API para worker e 6 de worker para API                                                                                                                                                  | Acoplamento de teste; separar de imports de produção                          |
| Import dinâmico / `require`        | 4 imports dinâmicos literais, nenhum não literal; 117 chamadas `require` literais                                                                                                                                            | Nenhum mecanismo não literal observado na varredura                           |

### Grafo de imports de produção observado

As arestas abaixo são imports de produção entre packages/apps, sem testes. São arestas observadas, não a lista de dependências permitidas pelo contrato-alvo.

| Owner                  | Packages importados em produção                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `adapters`             | `shared`                                                                                                                                                                                         |
| `agent-core`           | `persistence`, `platform`, `policy`, `shared`                                                                                                                                                    |
| `agent-evals`          | `policy-engine`, `shared`                                                                                                                                                                        |
| `agent-runtime`        | `approval-engine`, `model-gateway`, `observability`, `policy-engine`, `shared`                                                                                                                   |
| `api`                  | `agent-core`, `harness`, `observability`, `persistence`, `platform`, `shared`                                                                                                                    |
| `approval-engine`      | `shared`                                                                                                                                                                                         |
| `channel-gateway`      | `shared`                                                                                                                                                                                         |
| `chaos`                | —                                                                                                                                                                                                |
| `conversation`         | `harness-contracts`                                                                                                                                                                              |
| `harness`              | `harness-contracts`, `harness-orchestrator`                                                                                                                                                      |
| `harness-contracts`    | —                                                                                                                                                                                                |
| `harness-orchestrator` | `harness-contracts`                                                                                                                                                                              |
| `memory`               | —                                                                                                                                                                                                |
| `model-gateway`        | `shared`                                                                                                                                                                                         |
| `observability`        | `shared`                                                                                                                                                                                         |
| `persistence`          | `agent-runtime`, `approval-engine`, `channel-gateway`, `harness`, `harness-contracts`, `platform`, `shared`                                                                                      |
| `platform`             | `shared`                                                                                                                                                                                         |
| `policy`               | `shared`                                                                                                                                                                                         |
| `policy-engine`        | `shared`                                                                                                                                                                                         |
| `rag`                  | `platform`, `shared`                                                                                                                                                                             |
| `shared`               | —                                                                                                                                                                                                |
| `tools`                | `persistence`, `platform`, `shared`                                                                                                                                                              |
| `web`                  | `shared`                                                                                                                                                                                         |
| `worker`               | `agent-core`, `agent-runtime`, `approval-engine`, `harness`, `harness-contracts`, `harness-orchestrator`, `model-gateway`, `observability`, `persistence`, `platform`, `policy-engine`, `shared` |
| `workflows`            | `persistence`, `platform`, `policy`, `shared`                                                                                                                                                    |

Não foi observado ciclo no grafo de imports de produção. Incluindo testes, aparece um ciclo entre API e worker por imports relativos; também há teste de `platform` importando RAG e RAG de produção dependendo de `platform`. Esses caminhos não devem ser reportados como ciclos de runtime.

### Grafo de imports bare `@cvg/*` em testes

O inventário também encontrou 53 pares owner→package em testes, distribuídos por 16 owners. A tabela cobre os 25 owners do workspace; `—` indica ausência de import bare `@cvg/*` de saída em teste. Esse mapa inclui imports bare internos; os 9 imports relativos entre workspaces são contados separadamente acima. As arestas de teste podem coincidir com arestas de produção e não devem ser somadas como grafo único sem deduplicação.

| Owner de teste         | Packages importados nos testes                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapters`             | —                                                                                                                                                                                  |
| `agent-core`           | `persistence`, `platform`                                                                                                                                                          |
| `agent-evals`          | —                                                                                                                                                                                  |
| `agent-runtime`        | `approval-engine`, `model-gateway`, `observability`, `policy-engine`, `shared`                                                                                                     |
| `api`                  | `agent-core`, `approval-engine`, `harness`, `harness-contracts`, `observability`, `persistence`, `platform`, `rag`, `shared`                                                       |
| `approval-engine`      | —                                                                                                                                                                                  |
| `channel-gateway`      | `shared`                                                                                                                                                                           |
| `chaos`                | `adapters`, `approval-engine`, `channel-gateway`, `model-gateway`, `persistence`, `policy-engine`                                                                                  |
| `conversation`         | `harness`, `harness-contracts`, `persistence`                                                                                                                                      |
| `harness`              | `harness-contracts`, `harness-orchestrator`                                                                                                                                        |
| `harness-contracts`    | —                                                                                                                                                                                  |
| `harness-orchestrator` | `harness-contracts`                                                                                                                                                                |
| `model-gateway`        | `shared`                                                                                                                                                                           |
| `memory`               | —                                                                                                                                                                                  |
| `observability`        | —                                                                                                                                                                                  |
| `persistence`          | `approval-engine`, `channel-gateway`, `harness`, `harness-contracts`, `platform`, `shared`                                                                                         |
| `platform`             | `rag`                                                                                                                                                                              |
| `policy`               | —                                                                                                                                                                                  |
| `policy-engine`        | `shared`                                                                                                                                                                           |
| `rag`                  | `shared`                                                                                                                                                                           |
| `shared`               | —                                                                                                                                                                                  |
| `tools`                | `persistence`, `platform`                                                                                                                                                          |
| `web`                  | —                                                                                                                                                                                  |
| `worker`               | `agent-runtime`, `approval-engine`, `harness`, `harness-contracts`, `harness-orchestrator`, `model-gateway`, `observability`, `persistence`, `platform`, `policy-engine`, `shared` |
| `workflows`            | `persistence`                                                                                                                                                                      |

O teste `packages/chaos/src/__tests__/chaos.test.ts` importa seis packages (`adapters`, `approval-engine`, `channel-gateway`, `model-gateway`, `persistence` e `policy-engine`), conforme a linha correspondente. Nenhum desses imports é classificado como dependência de produção de `chaos`.

### Referências de projeto TypeScript

Foram observadas 27 arestas de imports de produção sem referência correspondente no `tsconfig.json` do owner, distribuídas por 13 projetos:

| Owner             | Imports sem project reference observado                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `api`             | `observability`                                                                                                        |
| `worker`          | `platform`, `agent-runtime`, `model-gateway`, `observability`, `policy-engine`, `harness-contracts`, `approval-engine` |
| `agent-evals`     | `shared`, `policy-engine`                                                                                              |
| `agent-runtime`   | `approval-engine`, `policy-engine`, `model-gateway`, `observability`, `shared`                                         |
| `channel-gateway` | `shared`                                                                                                               |
| `model-gateway`   | `shared`                                                                                                               |
| `observability`   | `shared`                                                                                                               |
| `persistence`     | `channel-gateway`, `agent-runtime`, `approval-engine`, `harness-contracts`                                             |
| `platform`        | `shared`                                                                                                               |
| `policy-engine`   | `shared`                                                                                                               |
| `rag`             | `platform`                                                                                                             |
| `tools`           | `platform`                                                                                                             |
| `workflows`       | `platform`                                                                                                             |

Essa diferença pode afetar builds com project references, mas nenhum build isolado foi executado. Portanto, não é classificada como build failure nesta etapa.

## Estado observado versus arquitetura-alvo

O subgrafo novo é compatível com a direção documentada `harness-contracts ← harness-orchestrator ← harness`. Os pacotes `agent-core` e `workflows` permanecem classificados como resíduo de produto; outros packages legados continuam mistos e não foram declarados extraídos. O alvo Phase 0/1 vale para os packages neutros: não importar implementação de produto/API, persistência, provider ou canal. O grafo mais amplo de produto não está declarado limpo nem é objeto de refactor nesta descoberta.

`tests/architecture/dependency-direction.test.ts` cobre fronteiras neutras de contracts/orchestrator/harness e o factory canônico; não verifica o workspace inteiro, todos os manifests, ciclos globais ou resolução do campo `exports`. Essa é uma observação sobre cobertura existente, não um pedido para executar o teste agora.

Há também um contrato específico de composição de workflow em [`aaa_composition_contract.md`](../02_spec/aaa_composition_contract.md). Ele define uma fronteira pretendida em que o grafo não alcança executor, outbox, journals, repositórios ou credenciais e descreve uma composição futura. É uma constraint adicional para revisar na SPEC; não prova que a implementação atual já está nessa composição nem declara uma violação nesta descoberta.

## Riscos, hipóteses e pontos a decidir

| Risco ou incógnita                                               | Evidência observada                                                                                 | Consequência para M07                                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Build isolado e project references podem divergir                | 27 arestas sem referência; nenhum build isolado executado                                           | Medir antes de escolher correção ou classificar falha                                                                 |
| Consumers podem não resolver pelo export público                 | 6 packages sem `exports`; aliases apontam direto para fonte; nenhum subpath privado observado       | Declarar quais packages são públicos e verificar package resolution em slice autorizado                               |
| Testes atravessam fronteiras de workspace                        | 9 imports relativos em testes e caminho test-only envolvendo RAG                                    | Decidir se ficam como fixtures de integração ou migram para interfaces públicas                                       |
| Documentação de dependências não é uniforme                      | `0103` e `0116` divergem; a classificação mais recente limita a arquitetura-alvo ao subgrafo neutro | Manter a documentação atual, registrada, como fonte do alvo e resolver conflitos antes de ampliar escopo              |
| Alterações pré-existentes tornam a observação candidate-specific | Worktree sujo e alterações anteriores em arquivos de runtime/configuração                           | O inventário deve ser refeito no candidate exato antes de qualquer promoção; não reaproveitar certificados históricos |

## Recomendação e gate

Discovery entrega evidência suficiente para revisão do recorte e dos critérios de M07. O próximo passo do pipeline é **aprovar a validação Discovery específica de M07**; os gates gerais `0090` e `0190` existentes são históricos e pertencem a outras tasks. Até essa aprovação não inicio PRD conforme a constituição do repositório. Após PRD e SPEC, será necessária revisão humana e um gate local específico antes de qualquer BUILD.

O pedido de decisão e a barra congelada da crítica estão em [`docs/04_audit/evidence/AUD-20260923/M07/`](../04_audit/evidence/AUD-20260923/M07/). Produção permanece `NO_GO`; G21-5/G21-6 continuam fechados. Nenhum dado real, ação sensível, teste ou build foi usado para produzir esta descoberta.
