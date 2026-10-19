# Delta proposto para os ledgers — HISO005-P2-BUILD-0240 (CONT-20261018-D9EF)

Texto para o lead integrar. Esta unidade não editou `99`, `20`, `30`, coordenação nem `0370`. Evidência: [estado](state.json), [aceites MS01–MS12](acceptance-status.json), [deltas preparados](promotion-deltas-prepared.json).

## `docs/99_runtime_state.md`

- `last_completed_action`: BUILD0240 qualificado localmente na fonte `f22a74a09fe1abefd3eaf0b11f65815b02c5c63d` (candidata `/mnt/ia/cvg-hiso005-build0240-20261018`). A crítica R1 deu REVISE com dois P1 (orçamento compartilhado e prazo posterior apagavam violação conhecida). A correção mínima está em `f22a74a0`. R2, a última rodada, deu APPROVE com zero obrigatórios em 21 cenários. Os 16 gates passaram em Node22 e o verificador corrente conferiu 38 hashes. A promoção ainda não foi feita.
- `status`: `READY_FOR_NEXT_STEP` (a promoção fica com o lead).
- `next_action`: promover os 9 deltas próprios por pré-imagem atual, rodar os checks T1 e selar. Em seguida, fazer o recon delimitado da próxima causa: corpos `dist` do Vitest sem proveniência compilada e `UNKNOWN_FUNCTION`.
- B6: continua `INCOMPLETE`, com 1.118 diagnósticos (537 baseline + 581 novos), 303 MATCH, 0 verified e 0 provas. A queda de 1.609 para 1.118 não é crédito de resolução.

## `docs/20_master_execution_log.md`

### 18/10/2026 — HISO005-P2-BUILD-0240 (Claude Code, CONT-20261018-D9EF)

- Retomada pelo checkpoint. Os 9 hashes bateram. O lint focal passou. O formato falhou só na quebra de linha do literal relocado em `tests/b6-0236-semantic-engine.test.js`; o `prettier --write` deixou a sequência de tokens igual. Commit seletivo `b766ffc5` e freeze `source-freeze.json`.
- Crítica fresca R1 deu REVISE: R1-REQ-01 (o refinamento esgota `maxFiles`, que é compartilhado, e oculta uma violação v2) e R1-REQ-02 (o pai trocava a saída por `empty()` em timeout e descartava produto já conhecido). Correção em `f22a74a0`, em 3 paths próprios:
  - o pai roda primeiro um census só negativo, com as recusas v2 e perfil próprio `node22-linux-v2-refusal-census-v1`, e depois o refinamento, os dois sob um único prazo; nenhum limite aumentou;
  - o worker transmite cada violação no momento em que a encontra, e o pai une as violações em todos os caminhos;
  - 4 testes novos.
  O teste novo deu 79/79 e a regressão deu 398/398, sem skips. Uma tentativa de regressão foi interrompida pelo lead, sem crédito, antes de um ajuste defensivo. Freeze em `source-freeze-r2.json`.
- R2 (última rodada) deu APPROVE, com zero obrigatórios e 21/21 cenários; R1-REQ-01/02 foram corrigidos fisicamente. Ficaram 6 achados opcionais informativos.
- Qualificação:
  - referência instalada nova (`3120988f…`) e referência compilada (`99cf7814…`, leitor PROVEN com 112 arquivos), da mesma fonte;
  - consumidor físico fresco sem produto: 207 imports, 76 exports, 8 pacotes, zero rede;
  - PG próprio na porta 56240;
  - `npm run certify` com 16/16 PASS (`ebc27246…`, run `run-ebc27246e362-mve7rfp9`): 5.290 unit, 302 PG e 12 E2E, zero skips e zero flaky, cobertura de 94,39% em linhas e 90,2% em branches;
  - `certification:verify` com 38 hashes, antes e depois dos emits do SDK; paridade SDK 21/21.
- Medição B6 integral normal/strict na v3: INCOMPLETE com 1.118 diagnósticos, 0 provas e 0 violações; payload e grafo idênticos entre os dois modos. A v2 nos mesmos inputs dá 1.609, idêntica tupla a tupla ao 0237. Default/P1 saem byte-iguais aos de 84d8 e 9b49. O ledger 537 + 1.721 + 1.072 + 581 está preservado com hashes ou null.
- PG removido por ID e label, com 0 sessões de cliente. Portas livres e nenhum processo próprio residual. Pacotes selados 137 e 590 intactos.
- Incidentes:
  - `~/.npm/_cacache` virou symlink depois da migração; a receita recusa o alias (`CACHE_ALIAS`). Foi resolvido com uma cópia byte-exata dos 298 payloads do lock no runtime privado.
  - Sem `HOME` no processo pai, a receita da referência instalada falha com `ENOENT` de forma reproduzível.
  - Snapshots das tentativas encheram o volume compartilhado `/mnt/ia` (0 livre por cerca de 10 min, entre 19:11 e 19:20 UTC). Os diretórios próprios foram removidos e as falhas foram preservadas.

## `docs/30_backlog_master.md`

- HISO005-P2-BUILD-0240: estado `COMPLETED_LOCAL` (exceto MS12). MS01–MS11 PASS; MS12 pendente com o lead (promoção, T1 e selo).
- Item novo (sugestão): recon de proveniência dos `dist` do Vitest e dos `UNKNOWN_FUNCTION` hoje alcançados (`@vitest/*`, `vitest/dist`), com testemunhos físicos antes de qualquer HOW. B6, HISO005, P2 e P3 continuam abertos.
- Opcionais do R2 para backlog técnico:
  - teste automatizado da refinação parada;
  - marcador explícito de saída unida ao census;
  - validação de `file` nas violações transmitidas pelo stream;
  - `selectedKey` nos exports em forma abreviada.

## `docs/08_runtime/agent_coordination.md` (claim HISO005-P2-BUILD-0240-20261018)

- Linha de fechamento: «BUILD0240 qualificado localmente em `f22a74a0`. R2 APPROVE, 16 gates, 38 hashes; B6 INCOMPLETE 1118, 0 provas. PG `cvg-hiso005-build0240-pg` removido; portas 56240/3426/4426 livres. A promoção dos 9 deltas fica com o lead. O runtime mantém `installed-reference-r5` e `compiled-reference-r6` (5,7 GB), que podem ser removidos depois da promoção.»

## `docs/04_audit/evidence/empty-artifact-status.json` (catálogo central)

- Acrescentar as 7 entradas de [empty-artifact-central-delta.json](empty-artifact-central-delta.json). São capturas vazias antigas do test-builder desta pasta, já registradas localmente. Sem elas, `check-evidence-hygiene` acusa 7 falhas desta pasta. As outras 21 falhas atuais são de CLAUDE100/CODEX100 e não pertencem a esta unidade.

## `docs/03_build/0391_hiso005_semantic_proof_execution.md`

- Atualizar os marcos: M2 e M3 concluídos (R1 REVISE, depois R2 APPROVE, com as duas rodadas usadas), M4 concluído (qualificação e medição). M5 depende da promoção pelo lead.
