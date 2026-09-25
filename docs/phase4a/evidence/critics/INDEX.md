# Índice de reconciliação dos críticos Phase 4A — AUD19-012 (2026-09-20)

Os três relatórios abaixo SÃO as aprovações independentes registradas em
`../RESULT.json` (`runId AAA-4A-20260917`, decisão `PASS`, gerado em
`2026-09-17T12:00:30.692Z`). Os hashes conferem byte-a-byte com o vínculo
`candidateBound` do RESULT:

| Relatório                | Veredicto | SHA-256                                                            | Bytes | Confere |
| ------------------------ | --------- | ------------------------------------------------------------------ | ----- | ------- |
| `critic-architecture.md` | APPROVE   | `5d8a66902d6bd96f9e663e97d1fc602a3a62d125dafb0bc5be4ba7568ea5291d` | 556   | SIM     |
| `critic-security.md`     | APPROVE   | `3a4f3a46d8fa32f1662b575f219f62bcf78896821ad8e5561a982fea5e8aa61a` | 2175  | SIM     |
| `critic-transaction.md`  | APPROVE   | `285a8901e5e9ce896457ae9f795fb52200aa72bfc329296fed6d23e5eb08babc` | 1607  | SIM     |

Candidato vinculado: `aaa4a-df2c0b1a1b7e0e9a`
(`df2c0b1a1b7e0e9a40badf7bd04a444a0ecf1f30390865412b2845adce492e77`).
Commit de registro: `05d1f33` (2026-09-17).

## Reconciliação do texto `critics=PENDING`

As frases "critics are PENDING as expected" / "critics=PENDING is expected"
dentro dos relatórios referem-se ao estado PRÉ-relatório da certificação
(o campo `critics` ainda não preenchido quando a revisão começou) e não
negam estes veredictos: cada arquivo abre com `APPROVE` e está listado com
`verdict: APPROVE` no RESULT. Textos históricos que diziam "críticos
pendentes" descrevem a janela anterior ao registro; este índice os sucede
sem apagá-los.

## Limitações declaradas (não fabricadas)

- Identidade da sessão do crítico: ausente nos artefatos — NÃO registrada.
- Timestamp por revisão: ausente — usa-se o `generatedAt` do RESULT e o
  commit `05d1f33` como envelope temporal, sem alegar precisão por relatório.
- Pacote selado (sealed packet) por revisão: ausente — NÃO alegado.
- Sentinel de mutação por revisão: ausente — NÃO alegado.
- Saída bruta (raw) por revisão: ausente — NÃO preservada.
- Referências internas de `critic-security.md` usam caminhos absolutos da
  máquina de origem (`/home/...`) com sufixo `:linha` — não portáteis,
  preservados como histórico; o conteúdo técnico permanece legível.

A barra de proveniência de crítica (sessão, timestamp, pacote, raw, sentinel
por revisão) passa a ser exigida para TODA crítica futura, incluindo a de
`AUD19-016`.
