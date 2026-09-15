# AAA-04 — Revisão independente (Agente 1)

- Veredicto: `APPROVE_WITH_CONDITIONS` para a barra `v1` (`9904c376…` + cinco anexos), por escopo e hash.
- Revisor: Agente 1, que não redigiu AAA-04. Não é signoff humano, congelamento pelo autor ou autorização de BUILD/produção.

## Método

1. Recomputei os hashes dos seis artefatos e comparei com o manifesto: 6/6 conferem.
2. Reexecutei o validador documental (`validate-quality-bar.py`, exit 0) e refiz a checagem estrutural de forma independente: 80 critérios únicos, 27 `BLOCKING`, 39 `HIGH`, 14 `MEDIUM`, 20 áreas, zero campo obrigatório ausente.
3. Desafio documental N1: criei cópia adulterada da barra em `/tmp/opencode`; o hash divergiu (`f8dd8c7d…` → `d9ce54b9…`), o que impediria veredicto atual.
4. Cruzei o protocolo comparativo com o plano 0324 §5 e com o `aaa_execution_contract` (AAA-03): partição/holdout selado antes de qualquer observação, métricas fixas, regra de decisão com IC 95%, sem State of Art sem holdout.
5. Cruzei a barra com os achados `F11/F12/F14` e com os critérios `Q-A07/Q-A08/Q-A09` do contrato de execução.

## Resultado

- PASS: estrutura, campos, criticalidade, meta ≥97, protocolo congelado, certificação histórico/atual/humano, N1–N9 especificados, rastreabilidade.
- PASS: desafio documental "fonte alterada" executado; skip/evidência antiga estão especificados e sua prova executável pertence a AAA-13, como o próprio artefato declara.
- CONDITIONAL: tolerâncias numéricas.

## Achados

- `AAA04-R1-F01` (P2) — a barra audita o denominador de coverage, mas não congela piso numérico; `vitest.config.mts` exige 80/80/80/80, abaixo do proposto no plano (≥90 statements/lines/functions; ≥85 branches; ≥95 branches críticos; mutação dirigida 100%). Fechar em `v2` com números ou alternativa justificada. Não bloqueia o escopo AAA-08.
- `AAA04-R1-F02` (P3) — limites técnicos de performance (p95 persistência ≤2s, ack ≤10s, rampa 10k→100k) não estão registrados como alvo proposto; ficam apenas como prosa dependente de D03. Registrar em `v2` sem alegar aprovação.
- `AAA04-R1-F03` (P3) — a limitação "orçamento por turno precisa ser explicitado no contrato" fica fechada pela revisão 2 do AAA-03 (sem incremento de barra).

## Próxima ação do autor

Agente 3 versiona a barra para `v2` (F01/F02), renova manifesto e hashes, preserva `v1` no histórico; evidência AAA-08 emitida sob `v1` deve ser reexecutada no escopo afetado quando `v2` existir.
