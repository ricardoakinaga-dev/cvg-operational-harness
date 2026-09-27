# 0137 — SPEC curta: isolar artefatos E2E da evidência histórica

- Task: PR-009 de [0356](../03_build/0356_production_backlog_2026-09-26.md), fatia 1.
- Origem: achado F05 da [AUD-0578](../04_audit/0578_program_comprehensive_audit_2026-09-26.md).
- Trilha: T2 da [constituição](../07_agents/AGENTS.md). A instrução do usuário de implementar o planejamento autoriza esta correção local e reversível; esta SPEC não concede gate T3/T4, produção ou alteração de contrato público.
- Estado: `BUILD_LOCAL_AUTHORIZED` para a fatia 1; resultado da execução registrado abaixo após os gates.

## Recon

`tests/e2e/ux-accessibility.spec.ts` usa a constante `EVIDENCE` apontando para `docs/04_audit/evidence/AUD-20260919/AUD19-013`. Quatro chamadas a `page.screenshot` escrevem sempre os mesmos PNGs nessa pasta. Rodar Playwright pode, portanto, substituir provas de 19/09 sem alterar o teste. `test-results/` é ignorado pelo Git e é o diretório de saída isolado do Playwright.

## Regras de implementação

1. Usar `testInfo.outputPath()` para os quatro screenshots. O caminho é próprio da tentativa do teste e permanece em `test-results/`.
2. Remover a constante `EVIDENCE`. Não editar nem regenerar os PNGs históricos.
3. Registrar SHA-256 dos quatro arquivos antes e depois do E2E e confirmar igualdade.
4. Conservar as asserções e a jornada atual. JUnit/runId, novas jornadas de aprovação e estabilidade visual são fatias distintas da PR-009.

## Critério de pronto da fatia 1

- `typecheck`, `lint`, `npm test`, `test:postgres` e E2E verdes em Node 22 com PostgreSQL descartável, nos limites de falhas de baseline identificadas.
- Os quatro hashes históricos permanecem iguais e os quatro novos screenshots aparecem somente em `test-results/`.
- O resultado, inclusive qualquer falha, fica registrado aqui e nos ledgers. A PR-009 só será concluída após as demais fatias e seus critérios em 0356.

## Execução e provas

- Implementado em `tests/e2e/ux-accessibility.spec.ts`: as quatro chamadas usam `testInfo.outputPath()` e `EVIDENCE` foi removida.
- Node 22.23.2: `typecheck`, `lint` e `docs:check-links` exit 0; `npm test` 316 arquivos/2.305 testes PASS e um skip controlado pela flag Phase 4A; `test:postgres` 35 arquivos/258 testes PASS; Playwright 12/12 PASS com `CI=1`, portas 3197/4199.
- Os quatro PNGs apareceram apenas em `test-results/`. Hashes históricos antes e depois, iguais: `ux-authz-desktop.png` `56a6085a…`; `ux-error-mobile.png` `7746703e…`; `ux-tenant-a.png` `67b9b698…`; `ux-tenant-b.png` `73024c34…`.
- A primeira reemissão de `npm run certify` (run `run-aud0578-pr009-20260926`, candidato `99a4f8de…`) teve 16 comandos exit 0, mas adjudicação `NO_GO` por dois hashes obsoletos do catálogo de skips, alheios à alteração E2E. A correção tem SPEC própria [0138](0138_skip_catalog_rebind.md). Veredito final do candidato atualizado ficará nos ledgers após a nova emissão.
