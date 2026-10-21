# Delta proposto para os ledgers — HISO005-P2-BUILD-0247 (CONT-20261018-D9EF)

Texto para o lead integrar. Esta unidade não editou `99`, `20`, `30`, a coordenação, o catálogo central nem `docs/02_spec`.

Evidência:

- [relatório](REPORT.txt)
- [aceites](acceptance-status.json)
- [comparação B6](b6-final-comparison.json)
- [conservação na raiz real](conservation-r1.json)
- [tabela de fixtures](fixture-table.json)
- [crítica R1](review-r1/review.json)
- [certify](certify-summary.json), com as análises [r1](certify-r1-analysis.json) e [r2](certify-r2-analysis.json)
- [promoção](promotion-deltas-prepared.json)
- [achado Annex B](finding-annexb-block-function.json)
- [recibo do runtime](runtime-release-receipt.json) e [recibo do PG](postgres-release-receipt.json)

## `docs/99_runtime_state.md`

- `last_completed_action`: BUILD local da SPEC0247 (SHA `082ad2f4…`) na candidata detached `/mnt/dados/cvg-work/cvg-hiso005-build0247-20261020`.
  - Commit `783ef6d00e79` sobre `1d40fe51` (BUILD0245, kernel v6), 8 caminhos.
  - B6 na raiz `228e7918`: 11.723 → 11.723 diagnósticos, tuplas e payload iguais fora a telemetria e o literal de versão; 0 provas, 0 violações.
  - Crítica R1 APPROVE, sem obrigatórios.
  - certify local NO_GO nas duas tentativas (r1 14/16, r2 13/16); nenhum FAIL é do delta.
- `status`: `BUILD_LOCAL_DONE_CERTIFY_NO_GO_ON_BASE`. O código e a medição B6 estão fechados; a certificação não.
- `next_action`: o lead porta `783ef6d0` (patch `promotion-783ef6d00e79.patch.txt`, pré-imagens em `promotion-783ef6d00e79.json`) para a main atual, que já tem o PR #11 (vite 8.2.4), e roda o certify lá. Se a 0245 não estiver na main, vale a alternativa da SPEC0247 §3.7.
- B6: continua `INCOMPLETE`, sem crédito.

## `docs/20_master_execution_log.md`

### 20–21/10/2026 — HISO005-P2-BUILD-0247 (Claude Code, CONT-20261018-D9EF)

- **Delta.** C0: 9 categorias sintáticas das alças do wrapper CJS, raiz `UNKNOWN_CJS_EXPORTS` no módulo (normal e census) e U para todo importador (primeira carga e cache). C1: valor inicial = objeto `exports` opaco por módulo. C2: `if` indecidido une os ramos, só em CJS. C3: `checkExport` sobre o valor rastreado. Versão `semantic-kernel-v7-cjs-export-value`; literal migrado em 6 testes B6 (7 ocorrências), como registrado antes da edição.
- **Testes.**
  - Novo `tests/b6-0247-cjs-export-value.test.js`: 98/98, com os 71 fixtures do catálogo e T1, T2, T2b, T3 e Q3 da R2 da SPEC (normalizados para várias linhas; o texto da R2 dava `UNKNOWN_PARSE`).
  - Primeira falha na v6: 75/98. Literal: 39 falhas, todas do literal.
  - Mutantes C0, C0 só raiz, C1, C1 sem silêncio, C2 e C3: todos morrem.
  - Focal B6 988/988 (r1 e r1b), nativo 79/79, prettier/lint/typecheck/docs:check-links PASS (lint falhou na r1 por variável sem uso no teste novo; corrigido na r1b).
  - Consumidor fresco PASS (207 exports, 76 de runtime).
- **Fixtures (76).** A: 18 PROVEN falsos fechados. B: 27 com as tuplas da base mantidas. C: 11 PROVEN mantidos. D: 9 PROVEN corretos perdidos (custo). V: V-literal mantida; 5 somem (3 falsas, 2 verdadeiras pela C0). R2: T2 e T2b perdem violação verdadeira (C1, C2), T3 ganha uma pela junção, Q3 perde PROVEN (C1). Nenhum PROVEN novo. A v7 é igual à variante de referência t3 da SPEC nos 76.
- **Raiz real.** 11.723 → 11.723; 10.833 tuplas iguais; payload igual fora a telemetria e `semanticBoundary.kernelVersion`; normal = strict; validation true; mesma época; 1.410/1.410 antes, durante e depois. 1.277 módulos import e 64 require (35 `.ts`, 29 `.tsx`), todos tocados só por C1; 219 afetados; nenhum com escrita, categoria ou junção. Contextos 229/256; worker ~115 s de 300 s.
- **Crítica.** R1 (crítico novo, não-fork): APPROVE, sem obrigatórios; 5 P3 tratados só na evidência. Sem R2.
- **certify.**
  - r1 (load ~8–14): NO_GO 14/16. Unit 6225/6225. Coverage: 5 timeouts de 15 s em testes claude100 e channel-gateway. Security: `npm audit` acusa vite 8.2.0–8.2.2 (GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm).
  - r2 (depois de 85 min esperando load < 6; PG novo): NO_GO 13/16. Unit 6224/6225 (timeout de 60 s em `apps/api/.../production-bootstrap-postgres-own.test.ts`). Coverage: 5 falhas de tempo, duas em `b6-0236` (spawnSync ETIMEDOUT de 30 s e timeout de 15 s; os mesmos testes levam 3,2–4,5 s nos outros quatro runs, inclusive no unit da r2) e três em claude100. Security: o mesmo advisory.
  - Nenhum FAIL é do delta: o lock da base tem vite 8.2.2, corrigido na main pelo PR #11 (`05d4a30a`); o resto é tempo sob carga.
  - O gate security (`npm audit`) consulta o registry, como no certify do BUILD0245.
- **Achado novo, pré-existente e fora do delta.** Annex B.3.3: função declarada em bloco em CJS sloppy reatribui a ligação do wrapper; o kernel resolve a função externa e dá PROVEN falso (v6 = v7). Precisa de recon antes da SPEC0246.
- **Recursos.** PG próprio removido (r1 e r2) por nome e label; portas 56263, 3449 e 4449 livres; runtime liberado (1,1 GB). Ficam a candidata, como âncora, e a raiz avaliada. Sem push nem PR.

## `docs/30_backlog_master.md`

- `HISO005-P2-BUILD-0247`: BUILD local feito (commit `783ef6d00e79` na candidata), certify local NO_GO na base `1d40fe51` por causas fora do delta. Falta portar para a main atual e certificar lá (lead).
- Riscos registrados:
  - o certify desta base exige o lock do PR #11; sem ele o gate security falha sempre;
  - timeouts de 15 s a 60 s sob carga em testes claude100, channel-gateway, apps/api e, no coverage, em `b6-0236`;
  - folga de 27 contextos no `maxContexts`.
- Novo achado para recon: Annex B.3.3 no kernel B6 (prova falsa pré-existente em CJS sloppy).
