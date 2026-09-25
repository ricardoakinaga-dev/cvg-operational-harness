# REM21-004 — BUILD / AUDIT

## BUILD

Escopo executado após `DISCOVERY -> PRD -> SPEC`, somente local, sintético e
descartável. Runtime declarado e usado nos gates: `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node` (`v22.23.2`).

Implementação:

- o guard compartilhado transporta `resolvedAddresses` por hop, suporta
  `allowLoopbackOnly` e mantém redirects manuais;
- os transports Node de channel/model usam `lookup` determinístico, `agent:
false`, SNI/Host do hostname original e propagação de abort/timeout;
- EvolutionAPI, Chatwoot, OpenAI-compatible e Ollama usam o guard composto;
- HTTPS é obrigatório para HTTP público; HTTP só passa com hostname e
  respostas DNS loopback, além de `allowPrivateNetworks: true`.

## AUDIT LOCAL

Comandos e resultados:

| Comando                                                                                                                             | Resultado                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `node_modules/.bin/vitest run packages/shared packages/channel-gateway packages/model-gateway --no-file-parallelism --maxWorkers=2` | `PASS`, 28 arquivos, 322 testes |
| `node_modules/.bin/vitest run` nos 5 arquivos SSRF/provider diretamente afetados                                                    | `PASS`, 5 arquivos, 92 testes   |
| `node_modules/.bin/tsc -p tsconfig.typecheck.json --noEmit`                                                                         | `PASS`                          |
| `node_modules/.bin/eslint` nos arquivos alterados                                                                                   | `PASS`                          |
| `node_modules/.bin/prettier --check` nos arquivos alterados/evidências                                                              | `PASS`                          |
| `git diff --check`                                                                                                                  | `PASS`                          |
| `node scripts/check-doc-links.mjs ...`                                                                                              | `PASS`, `broken: []`            |
| `sha256sum --check docs/04_audit/evidence/AUD-20260921/REM21-004/sha256sums.txt`                                                    | `PASS`, todos os artefatos `OK` |

Casos adversariais observados:

- endereço público validado chega ao transporte bound; fallback por hostname
  não é chamado;
- redirect resolve e prende novo endereço antes do segundo hop;
- rebinding para DNS privado não chama transporte;
- HTTP público e HTTP não-loopback são rejeitados;
- HTTP loopback sem opt-in é rejeitado; com opt-in, resposta DNS pública é
  rejeitada;
- servidor loopback descartável recebeu `Host` original e o corpo JSON;
- timeout e cancelamento preservam a classificação de erro dos providers.

## CRÍTICA E DECISÃO

A crítica independente fresh-context 01 retornou `PARTIAL`, encontrando
reutilização potencial de socket e falta de restrição do endereço loopback. A
rodada seguinte adicionou `agent:false` e `allowLoopbackOnly`, com regressão
Node 22 verde. A crítica fresh-context 02 confirmou essas correções, mas
marcou `PARTIAL` até existir o hash manifest; ele agora foi criado e verificado
em todos os arquivos listados. Os relatórios permanecem em
`INDEPENDENT-CRITIC-01.md` e `INDEPENDENT-CRITIC-02.md`; nenhuma crítica é
reivindicada como I1. A crítica fresh-context 03 retornou `PASS` depois da
verificação do manifesto e é registrada em `INDEPENDENT-CRITIC-03.md`.

O resultado local permanece `PASS_LOCAL / FINAL_CERT_DEFERRED`, produção
`NO_GO`. A certificação candidate-bound, freeze, gates PostgreSQL/externos e
decisão final continuam em `REM21-019`.
