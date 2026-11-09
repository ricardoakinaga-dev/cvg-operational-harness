# 0626 — Auditoria do repositório com notas — 04/11/2026

**Nota geral: 76/100. Produção: `NO_GO`.**

Auditoria T1 (somente leitura e execução de gates) feita por Claude Code sobre a `main` em `362dc043c` (#40). Sucede a [auditoria 0625](0625_repository_score_audit_2026-10-28.md), que deu média 72.

A nota geral é a média simples dos 20 itens abaixo. Escala igual à da 0625: 0 ausente, 25 incipiente, 50 parcial, 75 implementado com lacunas, 90 verificado no escopo, 100 demonstrado em operação.

## 1. Método e limites

| Verificação                                                                                             | Resultado                                |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `typecheck`                                                                                             | passa                                    |
| `lint`                                                                                                  | passa                                    |
| `npm audit --audit-level=high`                                                                          | 0 vulnerabilidades                       |
| `docs:check-links` e `evidence:check-hygiene`                                                           | passam (43.839 JSONs parseados, 0 erros) |
| `skip:governance`                                                                                       | passa (67 entradas no catálogo)          |
| `tool-catalog:check`                                                                                    | em dia                                   |
| `boundary:products`                                                                                     | 0 violações, status `INCOMPLETE`         |
| Testes (amostra: `products/shift-assistant`, `approval-engine`, `shared`, `contracts`, `policy-engine`) | 49 arquivos, 535 testes, todos passam    |

- **Não executado:** suíte completa, `test:postgres`, E2E, `certify` e imagem Docker. Exigem PostgreSQL e claim próprio. Para esses itens usei as evidências registradas nos ledgers e no CI.
- **Leitura parcial:** o repositório tem cerca de 90 mil arquivos versionados, 87 mil deles em evidências de auditoria. Li `AGENTS.md`, `docs/07_agents/AGENTS.md`, `docs/99_runtime_state.md`, a barra 0373, o índice AUD0625, a 0625 e trechos do log, do backlog e da coordenação. O restante veio de amostragem e métricas.
- **Efeito colateral:** `skip:governance` reescreve `certification/skip-inventory.json`. O arquivo foi revertido ao estado versionado.

## 2. Notas por item

|   # | Item                                         |   Nota | Fundamento                                                                                                                                                       |
| --: | -------------------------------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Direção e escopo (ADR-010/011, pipeline CVG) | **84** | Harness reutilizável e produto isolado, com `NO_GO` explícito. Governança proporcional T1–T4 (D-12) bem definida.                                                |
|   2 | Arquitetura e modularidade                   | **80** | 28 workspaces com portas e adapters. `apps/api/src/server.ts` tem 6.285 linhas e cinco arquivos passam de 1.800.                                                 |
|   3 | Isolamento harness e produto                 | **72** | `boundary:products` não achou violação de import. Retorna `INCOMPLETE` por 469 pontos de código dinâmico e 307 pacotes não verificáveis (HISO-005, documentado). |
|   4 | Qualidade e tipagem do código                | **86** | Typecheck e lint verdes. 18 usos de `any`/`@ts-ignore` em produção, nenhum TODO/FIXME em `.ts`.                                                                  |
|   5 | Testes e cobertura                           | **88** | 509 arquivos de teste, mutation guard, conformidade e catálogo de skips. Amostra executada passou inteira.                                                       |
|   6 | Dependências e supply chain                  | **88** | `npm audit` zerado, actions fixadas por SHA, SBOM, licenças, Trivy, gitleaks e CodeQL.                                                                           |
|   7 | Segredos e higiene do repositório            | **85** | Nenhuma chave privada versionada. Os `.pem` em `AUD0625-DEBIAN13-CODEX-20261028` são CAs públicas.                                                               |
|   8 | Sandbox e contenção de processos             | **66** | X01 e X02 (Landlock) mesclados. Abertos: `PROCESS` indisponível na imagem de produção, janela remoção entre `open` e `fstat`, nível B de cgroup.                 |
|   9 | Autorização, identidade e aprovações         | **82** | OIDC, RLS, grants por caso, origem da aprovação (0291), F18 fail-closed. Janelas de revogação documentadas, F18 parcial.                                         |
|  10 | Persistência e migrations                    | **82** | 38 migrations com RLS, locks e preflights testados em PostgreSQL. Várias são opt-in (0034, 0036, 0037), com risco de configuração.                               |
|  11 | Modelos, budgets e prompts                   | **78** | M01, M02 e C02 mesclados (streaming, requisição congelada, uso cobrado por tentativa). Sem ativação real de provider.                                            |
|  12 | Sessões e contexto                           | **78** | S01, S02, S04, S05, C01 e C03 mesclados. Faltam revisão final e uso integrado em produção.                                                                       |
|  13 | CI/CD e proveniência                         | **88** | `verify.yml` com barra REM21 e PostgreSQL, `release-image` e workflow do produto. Proteção do `main` pendente na condição 5 da barra 0373.                       |
|  14 | Deploy e hardening                           | **78** | Imagem distroless, não-root, read-only e `cap_drop`. Qualificação no ambiente de destino não demonstrada.                                                        |
|  15 | Observabilidade, backup e recuperação        | **72** | Heartbeat, alerta assinado e restore com cadeia íntegra, só em ambiente sintético. Faltam destino de alertas e restore real.                                     |
|  16 | Console web e SDK                            | **78** | SDK TS e Python com testes de processo real. Console com 174 testes e chunk de 633 kB.                                                                           |
|  17 | Assistente de Plantão (produto)              | **68** | Isolamento e NO_MODEL bons. Sem homologação ou piloto; D1–D4 e barra 0368 abertas.                                                                               |
|  18 | Governança de agentes e coordenação          | **72** | Regras de claim e commit seletivo claras. `agent_coordination.md` tem 3.626 linhas.                                                                              |
|  19 | Documentação: cobertura e rastreabilidade    | **84** | Pipeline DISCOVERY→AUDIT completo, SPECs numeradas, recibos de decisão humana e evidências hash-bound.                                                           |
|  20 | Documentação: atualidade e legibilidade      | **55** | Pontos de entrada desatualizados e ledgers extensos (ver seção 3).                                                                                               |

## 3. Achados e recomendações

| Prioridade    | Achado                                                                                                                                                                                                 | Recomendação                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| P1 (produção) | `PROCESS` está `unavailable` na imagem de produção (sem bubblewrap nem helper Landlock).                                                                                                               | Qualificar a imagem com o helper e o bwrap, ou manter `PROCESS` desligado até lá.               |
| P2            | `README.md` abre com "Estado atual — 29/10/2026" (`main` em `aa6afc49`). As ondas 5, 6 e 7 e o #40 já estão mescladas.                                                                                 | Reescrever o topo do README com o estado atual.                                                 |
| P2            | Topo de `99_runtime_state.md` diz `MAIN-CONSOLIDATION-20261103` `IN_PROGRESS` com próxima ação "publicar candidata por PR", mas o #40 já foi mesclado. O índice `aud0625_current_index.md` é de 29/10. | Fechar o estado, atualizar log e backlog (regra do `AGENTS.md`) e reconciliar o índice.         |
| P2            | Ledgers muito extensos: 99_runtime_state 2.404 linhas, log 2.192, backlog 2.154, coordenação 3.626.                                                                                                    | Arquivar entradas concluídas em `docs/08_runtime/archive` e manter só o estado vigente no topo. |
| P2            | `boundary:products` `INCOMPLETE`; várias exceções do relatório aparecem com `pinsHold: false`.                                                                                                         | Conferir os pins e fechar a prova positiva (HISO-005).                                          |
| P3            | `docs/04_audit/evidence` tem 4 GB e 87 mil arquivos; `.git` tem 1,4 GB.                                                                                                                                | Arquivar evidência antiga fora do Git e manter índices e hashes.                                |
| P3            | `server.ts` com mais de 6 mil linhas.                                                                                                                                                                  | Dividir por domínio de rota para reduzir conflito entre agentes.                                |

## 4. Conclusão

Engenharia acima da média: código tipado, testes extensos, supply chain controlada e governança explícita, com honestidade sobre o que não está pronto. Os pontos que puxam a nota para baixo são a documentação viva (cara de manter e já desatualizada nas entradas principais), o sandbox na imagem de produção e a prova positiva de isolamento. A produção segue `NO_GO`.

## 5. Resolução posterior (04/11/2026)

| Achado                                        | Estado                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| README desatualizado (P2)                     | Resolvido: seção "Estado atual — 04/11/2026".                                                                                                                                                          |
| Topo do runtime state desatualizado (P2)      | Resolvido: ledgers de estado, log e backlog reduzidos ao registro vigente; originais arquivados integralmente (`docs/08_runtime/archive/*_ate_20261103.md.txt`, SHA-256 nos próprios ledgers).         |
| Ledgers extensos e índice velho (P2)          | Resolvido: `agent_coordination.md` também arquivado; `aud0625_current_index.md` marcado como superado.                                                                                                 |
| `pinsHold: false` no `boundary:products` (P2) | Esclarecido: são pins do catálogo legado da SPEC 0228, mantido só como inventário histórico e que não remove diagnósticos; não é regressão. A prova positiva de isolamento continua aberta (HISO-005). |
| Sandbox `PROCESS` na imagem (P1)              | SPEC proposta: [0313](../02_spec/0313_process_sandbox_production_image.md), aguarda revisão T3 do usuário.                                                                                             |
| Peso de 4 GB de evidência (P3)                | SPEC proposta: [0314](../02_spec/0314_evidence_archive_offrepo.md), aguarda decisão do usuário; nada removido.                                                                                         |
| `server.ts` monolítico (P3)                   | SPEC proposta: [0315](../02_spec/0315_api_server_route_modules.md); BUILD depende da suíte base com PostgreSQL.                                                                                        |
