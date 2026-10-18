# 0612 — Plano integral de paridade e limpeza local

- Programa: `PARE100-20261014`. Pedido do usuário em 14/10/2026: plano executivo, roadmap, backlog e remoção de legados/órfãos.
- Saídas: [0376 — plano executivo](../03_build/0376_plano_executivo_paridade_integral.md), [0377 — roadmap](../03_build/0377_roadmap_paridade_integral.md), [0378 — backlog](../03_build/0378_backlog_paridade_integral.md), [SPEC 0207](../02_spec/0207_cleanup_orphaned_emits.md) e [evidência](evidence/PARE100-20261014/summary.md).
- Estado da entrega documental: `PLAN_READY`; novas capacidades `NOT_STARTED`. Limpeza executada, cartão P100-001 `VERIFY` com lint preexistente pendente. Produção `NO_GO`.

## Escopo do plano

O plano cobre o alcance integral da referência local `0.2.0-rc.1` no commit `768fb1f3d3dcf9a16659ee354e927d05475f22dd`, incluindo apps/desktop, Python, native, ferramentas avançadas e recursos opcionais distribuídos. Inventário estrutural: **318 manifests em 55 famílias**, todos ligados a task; [inventário](evidence/PARE100-20261014/deepseek-workspaces.json) e [mapa](evidence/PARE100-20261014/capability-family-map.json).

Há **36 cartões novos e oito fases**, com owners propostos, paths, método, dependências e pronto verificável. [Grafo/tarefas](evidence/PARE100-20261014/program-tasks.json): sem dependência interna desconhecida ou ciclo. As tasks PDSH e os gaps AUD0611 mantêm seus estados nas carteiras originais.

318 pacotes rastreados não significam 318 capacidades equivalentes nem 100% funcional atual. P100-003 expande e congela os requisitos por tool/método/evento/config/backend/jornada. O percentual do escopo integral está `NOT_MEASURED`; o aproximadamente 70% de 0611 pertencia a um escopo de motor menor. O plano impede excluir uma funcionalidade difícil e conservar o nome “paridade integral”.

Estimativa inicial proposta: 16–24 sprints de duas semanas, com integração/backend, frontend, contenção nativa e QA, e auditoria separada. A hipótese de 8–12 meses será reestimada em F0; não é prazo garantido nem orçamento aprovado.

## Remoção executada

Foram removidos **348 arquivos ignorados, total de 2.060.261 bytes**:

- 339 emits `.js`, `.js.map`, `.d.ts`, `.d.ts.map` ao lado de fonte `.ts` existente, em `apps/worker/src` e pacotes reutilizáveis.
- Nove emits órfãos de `packages/platform/src/secretary-preset` e `packages/persistence/src/journeys{,-postgres}`, cujas fontes já estão no legado isolado.

Cada path foi conferido no índice, no ignore e por SHA-256 antes de remover. Não houve `git clean`, remoção recursiva, wildcard destrutivo ou limpeza de trabalho de outro agente. [Manifesto completo](evidence/PARE100-20261014/cleanup-manifest.json), [pesquisa de consumidores](evidence/PARE100-20261014/cleanup-consumer-search.json) e [backup](evidence/PARE100-20261014/removed-emits-backup.tar.gz).

O backup é cópia dos emits removidos, não dado de produto. A recuperação é por lista/hash e nunca deve sobrescrever arquivo novo de outro agente. O rescan posterior aos testes encontrou zero path do manifesto regenerado.

**Nenhum dos 983 arquivos selecionados de implementação/config/testes versionados foi modificado.** A declaração autoral `apps/web/src/vite-env.d.ts` está preservada; TypeScript, lock, workspaces, `dist`, migrations, dados, evidências antigas e instalação DeepSeek também estão preservados. [Integridade](evidence/PARE100-20261014/post-cleanup-integrity.json).

Os quatro hits de paths JavaScript na pesquisa pertencem a exceções opcionais do checker de fronteira, não a imports de execução. A fronteira passou após apagar os emits, sem editar o checker.

## Legado que exige migração

`legacy/packages/secretary-evals`, `secretary-journeys` e `secretary-profile` ainda têm consumers/exports/testes/build. `apps/api/src/legacy-composition.ts`, manifests, aliases, configuração TypeScript e builder os alcançam. `run-agent-turn.ts` é deprecated, mas ainda é exportado e testado. Não são arquivos órfãos.

P100-010 migra os consumers sobre o kernel; P100-011 retira rotas/exports/workspaces e então apaga os arquivos executáveis. Retirar esses contratos é T3 e exige SPEC concreta revisada antes de BUILD, conforme a constituição. Sua remoção não foi feita silenciosamente nesta limpeza T2. Migrations/dados/evidências históricas continuam preservados na retirada final.

## Verificação atual

| Procedimento                     | Resultado observado                                             | Escopo/limite                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Typecheck Node 22.23.2           | PASS                                                            | Programa TypeScript atual, sem emits                                                                                                 |
| Lint                             | FAIL preexistente                                               | Helper `sleep` não usado na linha 26 de `pdsh-031-slice3e1.test.ts`; reproduzido sobre o arquivo de HEAD por stdin, sem editar fonte |
| `npm test`                       | PASS, 381 arquivos/3.249 testes; 23 arquivos/212 testes skipped | TEST_DATABASE_URL ausente; skips registrados, não convertidos em PASS                                                                |
| `test:postgres`                  | PASS, 37 arquivos/302 testes, sem skips reportados              | PostgreSQL 16 próprio, loopback, base descartável sintética                                                                          |
| E2E Chromium                     | PASS, 12/12, 29,6 s                                             | Config própria, API/web em portas próprias; sem reusar servidor nem atualizar snapshots                                              |
| Fronteira de produto             | PASS                                                            | Zero violations/diagnostics; nenhuma edição do checker                                                                               |
| Integridade/limpeza              | PASS                                                            | 983 fontes versionadas iguais; 348 candidatos ausentes; declaração autoral preservada                                                |
| Grafo/rastreabilidade estrutural | PASS                                                            | 36 cartões, 318 manifests/55 famílias com owner; funcionalidade ainda NOT_VERIFIED                                                   |

Logs e results ficam na [pasta de evidência](evidence/PARE100-20261014/summary.md). A mensagem de catálogo stale na suíte é do teste negativo de drift; o check direto final deve validar os catálogos restaurados. O container PostgreSQL próprio foi encerrado/removido, e o Playwright encerrou os servidores que iniciou. Inventário de recursos está preservado.

Não foram executados coverage atual, certify, supply-chain, instalação nova de dependências, providers externos ou novos comparadores diferenciais. Nenhum arquivo de implementação foi alterado; não se declara encerramento PDSH-031 ou certificação do motor pela limpeza de resíduos ignorados.

## Pendência e continuidade

P100-001 permanece `VERIFY`: a remoção física e os checks de regressão passaram, mas o gate T2 exige lint verde. A falha já pertence à fonte versionada em HEAD e ao claim da PDSH-031; não foi editada por este Codex. P100-002 registra a resolução com o owner e a reemissão do gate. Não usar `--ignore` no lint nem alterar threshold para fabricar pronto.

Próxima ação do plano: P100-003, expandir/congelar a matriz semântica. A documentação e a remoção segura pedidas foram entregues; a migração dos contratos legados e os novos BUILD ficam com gates concretos no backlog. Nenhum commit, push, deploy ou release foi feito.
