# Delta proposto para os ledgers — HISO005-P2-BUILD-0241 (CONT-20261018-D9EF)

Texto para o lead integrar. Esta unidade não editou `99`, `20`, `30`, a coordenação, `0370` nem `0391`. Evidência: [estado](state.json), [aceites IB01–IB12](acceptance-status.json), [deltas preparados](promotion-deltas-prepared.json), [bloqueio das receitas](reference-recipe-blocker.json).

## `docs/99_runtime_state.md`

- `last_completed_action`: BUILD0241 implementado e medido localmente na fonte `228e79180d6d635ae1013e5069fc10f2f79a1cf6` (branch local `build/hiso005-0241-20261018`, base `af63ba60`, candidata `/mnt/dados/cvg-work/cvg-hiso005-build0241-20261018`). D1 (corpo integral com contenção por aresta, corte determinístico, `phases` e `bodyCoverage`) e D2 (identidade 0234 por arquivo instalado) conforme a SPEC0241 `e09f635a…` e a errata R2 `b0358245…`. Crítica fresca R1 APPROVE, zero obrigatórios; sem R2.
- `status`: `BLOCKED` para a promoção: o certify da candidata deu 14/16 (unit e coverage FAIL por estado da base `af63ba60`, fora do delta) e a referência compilada da mesma fonte é impossível com as receitas congeladas nessa árvore (teto de listagem de 8 MiB).
- `next_action`: a consolidação resolve as pendências da base (`.gitleaksignore` com regra `sourcegraph-access-token`, 70 testes PARE217/SPEC0224 sem metadados de skip, 8 testes de capacidade de `packages/harness` lentos sob cobertura) e abre task própria para a listagem das receitas de referência; depois, PR dos 7 caminhos de `promotion-deltas-prepared.json`, recertificação da composição e nova medição B6 com referência compilada.
- B6: continua `INCOMPLETE`. Na árvore `af63ba60`: v4 com 2.410 diagnósticos (890 base + 1.520 novos), 0 provas, 0 violações, 303 MATCH, 0 verified; a v3 nos mesmos inputs dá 1.588 (890 + 698). A subida é a medição do corpo, não regressão; nenhum crédito.

## `docs/20_master_execution_log.md`

### 19/10/2026 — HISO005-P2-BUILD-0241 (Claude Code, CONT-20261018-D9EF)

- Autoridade conferida sem nova pergunta: SPEC0241 `e09f635a…` e errata `b0358245…` (`user-decision-20261018.json`). Candidata nova em `/mnt/dados`, `node_modules` copiado com `cp -a`, sem install nem mudança de lock. Contrato com IB01–IB12 `NOT_RUN`, escolha E4(a) e lista fechada da §3.1 conferida contra o código (36 motivos; 3 de envelope do pai/worker ficam globais por padrão).
- Primeiras falhas antes da fonte: o teste novo deu 25/28 vermelhos na v3 da base (os 3 verdes são invariâncias esperadas); a regressão antiga deu 719/719 na v3; a v3 da base reproduz C1–C6, X1–X3 e Y1–Y2 da recon.
- Implementação em 2 fontes (engine e checker) e teste novo `tests/b6-0241-integral-body.test.js` (28 casos). Migração registrada antes da edição em 4 testes antigos: 19 literais da versão do kernel e 12 registros instalados sintéticos que ganham o inventário 0234, sem assert removido. Regressão focal 747/747, zero skips. Lint e formato verdes. Commit seletivo `228e7918`, freeze `source-freeze.json`.
- Crítica fresca R1 (subagente novo, não-fork): APPROVE, zero obrigatórios, 7 P3 (observações para a próxima SPEC; P3-05 resolvida refazendo controles, diferencial e primeira falha sobre os bytes congelados).
- Qualificação:
  - referência instalada: a receita congelada recusa listar a árvore `af63ba60` (81.607 caminhos; `ls-tree` de 15 MB contra teto de 8 MiB). Foi construída pela mesma receita, sem mudar código, a partir de snapshot git privado com fingerprint de resolução idêntico (r9: 304 pacotes, 18.786 entradas, 17.344 arquivos, `353c8c4a…`); desvio declarado. Tentativas r2–r8 caíram numa corrida da receita (o monitor varre o snapshot enquanto o npm cria e remove opcionais de outras plataformas);
  - referência compilada: BLOCKED (`ls-tree --format` de 11,2 MB contra `maxBuffer` de 8 MiB, e o leitor exige a própria raiz avaliada);
  - consumidor físico fresco sem produto, pré e pós: 207 imports, 76 exports, 8 pacotes, zero rede; paridade SDK 21/21 (igual ao consumidor e ao emit 0240);
  - `npm run certify` só na candidata, PG próprio 56260, API 3446, web 4446: 14/16 PASS; unit 6.551/6.622 com 1 falha (`tests/security-scan-config.test.js`, base) e 70 pendentes (PARE217/SPEC0224, base); coverage FAIL pelo mesmo teste e 8 testes de capacidade; PG 302/302; E2E 12/12, zero skips e zero flaky; decisão NO_GO; `certification:verify` conferiu 37 hashes e falhou nos gates da base;
  - default e identity byte-iguais a `af63ba60`, `84d8` e `9b49` (890 diagnósticos), 8 pares de erro de CLI iguais.
- Medição B6 integral pós-gates, normal e strict iguais, sem estouro (65 s e 74 s) nem ENOBUFS: INCOMPLETE, 2.410 diagnósticos, 0 provas, 0 violações; `phases`: aquisição, pós-corpo e revalidação `COMPLETED`, corpo `CUT:maxContexts`, gramática `SKIPPED:UNKNOWN_OR_VIOLATION_PRESENT`; `bodyCoverage`: 23 de 1.341 módulos iniciados, 18 concluídos, 4 arestas contidas; 288 `UNKNOWN_UNREACHED_INSTALLED_ENTRY` agora visíveis; 22 arquivos instalados com identidade D2.
- Conservação §3.5 na árvore real: das 698 tuplas v3, 687 persistem exatas, 1 exceção 1, 6 exceção 2, 4 exceção 3, zero defeitos; multiset de violações contido (0/0). Ledger com 537, 1.721, 1.072, 581 históricas e 1.520 atuais, hashes ou null, sem crédito.
- PG removido por ID e label (0 clientes), portas livres, nenhum processo residual; 21,6 GB de referências e variantes removidos do runtime depois de registrar os hashes. Pacotes selados NEXT-RECON (40) e BUILD0240 (241) intactos.

## `docs/30_backlog_master.md`

- HISO005-P2-BUILD-0241: `BLOCKED_BY_BASE` para promoção. IB01–IB09 PASS (IB06 com nota), IB10 bloqueado pelos gates da base e pela referência compilada, IB11 PASS com limitação declarada, IB12 preparado sem aplicar.
- Item novo (consolidação): corrigir a regra do `.gitleaksignore` (ou o teste PR-011), dar metadados de skip aos 70 testes PARE217/SPEC0224 e tratar os 8 testes de capacidade sob cobertura, antes da promoção de qualquer delta sobre `af63ba60`.
- Item novo (T2, decisão própria): as receitas `build-installed-reference.mjs` e `boundary-semantic-compiled.mjs` não listam árvores acima de 8 MiB; e o monitor da receita instalada corre contra a remoção de opcionais pelo npm. Sem isso, nenhuma referência B6 da mesma fonte é possível no main consolidado.
- Próxima causa B6 (recon, sem HOW): o corte determinístico em `maxContexts` encerra o corpo depois de 23 módulos; mudar limite exige decisão própria (SPEC0241 §6). Observações P3 da R1 para a próxima SPEC: trace de identidade completo no pai (P3-01), teste da parada E6 (P3-02), semântica de `phases.revalidation` após erro global (P3-03), `ANONYMOUS_DECLARATION` inalcançável (P3-04), registros duplicados (P3-06), alvo não adquirido em aresta só de corpo (P3-07).

## `docs/08_runtime/agent_coordination.md` (linha sugerida no claim CONT-20261018-D9EF)

- HISO005-P2-BUILD-0241 (19/10): fonte `228e7918` na branch local `build/hiso005-0241-20261018`, R1 APPROVE, medida localmente (INCOMPLETE 2.410, zero provas). Promoção parada antes de qualquer escrita fora da candidata: certify 14/16 por estado da base e referência compilada bloqueada pelas receitas. PG 56260, API 3446 e web 4446 liberados; runtime reduzido a 311 MB.
