# Roadmap AUD54 — remediação da auditoria 0573 — 24/09/2026

Fonte: [auditoria 0573](../04_audit/0573_repository_audit_executed_gates_2026-09-24.md)
(nota geral `73/100`, produção `NO_GO`). Este roadmap organiza os achados
RA25-01–RA25-10 por dependência, sem alterar a autoridade dos gates M07 e sem
antecipar nenhuma aprovação. O ciclo M07-S1 permanece `FAIL / OPEN` e é
tratado como linha paralela, não como pré-condição das ondas D0–D2.

## Estado corrente

- Gates executados sob Node `22.23.2`: typecheck, lint, build, 2.137 testes,
  coverage 90,86/85,88/92,91/91,81, readiness, cobertura crítica, mutation
  guard, governança de skips, `npm audit`, diff check e E2E 12/12 — todos
  `PASS`.
- Gates quebrados: `format:check` (24 arquivos) e `docs:check-links`
  (5 ocorrências de parser). Os dois derrubam o `verify.yml` no gate `format`.
- 344 entradas não commitadas (~54k linhas) com último commit em 17/09/2026.
- Linha M07 paralela: C1L `FAIL / OPEN` por drift de
  `docs/02_spec/0190_spec_validation.md`; packet C1M em
  `IN_PROGRESS / DOCUMENTARY`.

## Sequência por dependência

| Onda                                  | Foco e tasks                                    | Pré-condição                                                        | Saída verificável                                                                                                             | Gate de saída                                                                                                          |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **D0 — preservar e desbloquear o CI** | RA25-01, RA25-02, RA25-08                       | Decisão humana sobre o escopo dos 344 arquivos pendentes            | Trabalho commitado em lotes coerentes; `format:check` exit 0; `LICENSE` presente                                              | `git status --porcelain` limpo ou com escopo declarado, `npm run format:check` exit 0, `npm run licenses:check` `PASS` |
| **D1 — gates de documentação verdes** | RA25-03, RA25-04                                | D0 concluído; task e gate de BUILD próprios para o checker de links | `docs:check-links` exit 0 sem esconder link quebrado; README e ponteiros AUD52/AUD53 reconciliados                            | Varredura `README.md docs` exit 0, higiene de evidências permanece exit 0, `npm test` (documental) `PASS`              |
| **D2 — matriz fresca de produto**     | RA25-05, RA25-09                                | D1 concluído e packet C1M com decisão humana hash-bound             | Candidate novo com baseline atual; matriz completa sob Node 22 com Postgres descartável; relatórios novos em `certification/` | Matriz local inteira `PASS`, pós-check sem drift, I1 e Final Critic disponíveis e aceitos                              |
| **D3 — qualidade estrutural**         | RA25-06, RA25-07                                | D2 concluído; cada fatia com SPEC/gate próprio                      | Redação de erro no worker com teste negativo; hotspots subdivididos sem mudança de comportamento                              | Caso negativo prova ausência de vazamento; typecheck/lint/testes/coverage verdes                                       |
| **D4 — higiene e sustentação**        | RA25-10                                         | D2 concluído                                                        | Política de retenção de evidência registrada e aplicada                                                                       | `evidence:check-hygiene` exit 0 e `docs:check-links` exit 0 após arquivamento                                          |
| **D5 — continuação M07 (paralela)**   | Packet C1M → decisão → matriz → I1/Final Critic | independente de D0–D4                                               | Novo candidate C1M e revisões disponíveis                                                                                     | Resultado do gate C1M registrado; S2/S3/S4 e M05 permanecem bloqueadas até aceite                                      |

## Regras de escopo desta rodada

- D0 e D1 são gates documentais/estruturais; nenhum deles autoriza alteração
  de comportamento do produto nem altera os 973 inputs da baseline C1J.
- `scripts/check-doc-links.mjs` só pode ser alterado sob task, SPEC curta e
  gate de BUILD próprios; a SPEC L03 v0.4 draft permanece intacta para não
  mudar seu hash de revisão.
- D2 é o único caminho para uma afirmação de "matriz verde atual". O `PASS`
  de C1J é histórico e está stale contra a baseline corrente.
- D3 não começa antes de D2: subdividir hotspots sobre uma base não congelada
  produziria drift de baseline novo.
- G21-5/G21-6 permanecem fechados; produção `NO_GO` em todas as ondas; nenhum
  dado real, provider/canal, IdP ou ação sensível entra em nenhuma onda.

## Critérios de parada

- Parar na primeira falha de qualquer gate dentro de uma onda e registrar
  causa raiz antes de avançar.
- Nenhuma onda começa com a anterior aberta, exceto D5, que é paralela por
  depender de decisão humana separada.
- Se I1 ou Final Critic continuarem `UNAVAILABLE`, D2 encerra `FAIL / OPEN`;
  a indisponibilidade do serviço não satisfaz o critério de revisão.
- Se `git status` apontar trabalho inesperado durante D0, interromper e
  pedir decisão de escopo antes de qualquer `git add`.

## Ritmo de registro

Cada onda concluída registra resultado e hashes em evidência nova em
`docs/04_audit/evidence/AUD-20260924/`; depois atualizar
[execution log](../20_master_execution_log.md), [backlog master](../30_backlog_master.md)
e [runtime state](../99_runtime_state.md), nessa ordem. A navegação
(`README`, [índice operacional](../99_operational_index.md)) acompanha apenas
o estado corrente; históricos permanecem preservados.

**Próxima etapa singular:** decidir o escopo de RA25-01 (commit ou stash dos
344 arquivos pendentes). Sem essa decisão, D0 não avança e o trabalho segue
em risco.
