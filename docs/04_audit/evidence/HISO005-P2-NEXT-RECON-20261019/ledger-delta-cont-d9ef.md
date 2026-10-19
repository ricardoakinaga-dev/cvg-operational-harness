# Delta proposto para os ledgers — HISO005-P2-NEXT-RECON-20261019 (CONT-20261018-D9EF)

Texto para o lead integrar. Esta unidade não editou `99`, `20`, `30`, a coordenação, o catálogo central, `docs/02_spec` nem a raiz. Evidência: [pacote de decisão](decision-packet.json), [aceites](acceptance.json), [estado](state.json), [SPEC materializadas](materialized-specs.json), [recibo de liberação](runtime-release-receipt.json).

## `docs/99_runtime_state.md`

- `last_completed_action`: recon T1 das duas barreiras da B6. Duas perguntas T3 prontas, com as SPEC0242 e SPEC0243 materializadas na pasta de evidência para cópia byte a byte em `docs/02_spec`.
- **Causa do corte.** O corte em `maxContexts` vem do helper `__name` do chai: 145 contextos de largura, não de profundidade. Sem corte, o corpo precisa de 145 contextos, 125.460 estados e profundidade 8.
- **Segunda barreira.** O relógio de 120 s do comparador de identidade conta desde a criação do verificador. Com o corpo integral, isso dá `validation: false`.
- `status`: `WAITING_HUMAN_DECISION` (T3).
- `next_action`:
  1. o lead confere o diff r2→r3, que corrige o R2-01 sem terceira rodada;
  2. copia `materialized/0242_b6_body_caps_deadlines.md` e `materialized/0243_b6_reference_source_scope.md` para `docs/02_spec` e confere os SHA;
  3. leva as duas perguntas do `decision-packet.json` ao usuário.
- B6: continua `INCOMPLETE`, sem crédito.

## `docs/20_master_execution_log.md`

### 19/10/2026 — HISO005-P2-NEXT-RECON-20261019 (Claude Code, CONT-20261018-D9EF)

- **Q1, causa e diagnóstico.**
  - O diagnóstico usou a v4 de `d6203875` em cópia privada, com tetos experimentais, sobre a mesma entrada da T2, que reproduz os 2.410 diagnósticos.
  - O corte vem de `__name` (`chai/index.js:212`), com 145 contextos. Passam de 64 só helpers de registro: `$constructor` do zod (98), `wrapAssertion` (74) e `assertTypes` (66). O máximo de primeira parte é 17.
  - Cortes sucessivos: 64 e 128 contextos cortam no módulo 23; 256 e 512 cortam por `maxStates` no módulo 1.026; o corpo integral exige 145 contextos e 125.460 estados.
  - O custo é linear: cerca de 6 mil estados/s e RSS máximo de 1,28 GB. A memoização não ajuda.
- **Q1, pipeline e prazos.**
  - Com 256/250.000 e prazo de 120 s, a pipeline levou 108,7 s e 109,8 s, mas saiu com `validation: false`.
  - A causa é o relógio de 120 s do comparador de identidade, contado desde a criação do verificador.
  - Sob load ~10, até a configuração oficial atual estourou o prazo (135 s).
  - A L3 (relógio por fase), executada como diagnóstico com 256/250.000/300 s, deu `validation: true` em normal e strict. A fase 1 durou 27–36 s e a finalização final, 2 s.
  - Conservação: 1.520 tuplas viram 12.631, e só some a tupla de envelope; violações 0 e 0.
- **Q2, exclusão da evidência.**
  - A evidência é 98,9% do snapshot de fontes e cresce cerca de 205 MB por dia. A margem instalada era 22 MB em `228e7918`; a do tar compilado, 188 MB.
  - As receitas com `docs/04_audit/evidence/**` excluído deram 280,6 MB de snapshot.
  - `packages` (304), entradas e saídas compiladas e a medição B6 (2.410, tupla a tupla) ficaram iguais.
  - Elevar para 8 GiB afrouxaria leitor, comparador, varredura de produto e toolchain, e o teto de entradas chegaria em cerca de 18 dias.
- **Crítica (crítico novo, não-fork).**
  - R1: REVISE nas duas, com 8 obrigatórios.
  - R2: REVISE só por R2-01 (ordem de BUILD e linhas de base). Os demais obrigatórios ficaram resolvidos.
  - R2-01 e os P3 foram corrigidos em r3, com ordem fixa 0243 → 0242, sem terceira rodada.
- **SPEC materializadas.** SPEC0242 `fa22cf4e5d102421aec49ced674ca5d1720444de53998741d123184ef2b14677` e SPEC0243 `6db49cf51280a2f0867d45f98eaf4d0fae5b9f94b49d96bb21692df0657afd06`.
- **Liberação.**
  - Removidos o worktree `eval-228e` e 9,7 GB de runtime; os hashes foram registrados antes.
  - Sem PG, sem portas e sem processos.
  - Nenhum código promovível, commit, push ou edição de ledger.

## `docs/30_backlog_master.md`

- HISO005-P2-NEXT-RECON-20261019: `COMPLETED_LOCAL`, decisão T3 pendente.
- Futuras, ambas `WAITING_HUMAN_APPROVAL`:
  - `HISO005-P2-BUILD-0243` (escopo de fonte das receitas);
  - `HISO005-P2-BUILD-0242` (tetos e prazos do corpo integral).
  - Ordem, se as duas forem aprovadas: 0243 primeiro.
- Riscos registrados:
  - `maxNodes` a 1,18× de folga, fora do delta: estourar perde o corpo inteiro na aquisição;
  - margem do snapshot instalado em cerca de 1,6 dia na média até a decisão da Q2;
  - fragilidade de prazo das medições oficiais atuais sob carga.
- Lacuna latente registrada na SPEC0243: o archive por lote da receita instalada não usa `--literal-pathspecs`. Hoje nenhum nome rastreado é afetado.
