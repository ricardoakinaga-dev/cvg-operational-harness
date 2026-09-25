# M07-S1-R1 — resultado do gate de implementação

## Decisão

**FAIL / não encerrável.** O candidato congelado foi verificado sem drift, mas os testes focados, a suíte completa e a execução de cobertura terminaram com uma falha no novo teste sintético `reports in-flight, expired, raced, approval-waiting and conflicting claims`. A falha ocorre porque a retomada de aprovação não corresponde à proposta ativa da conversa (`STATE_CONFLICT`). O teste fixture não inicializa o estado de proposta/aprovação exigido por `assertExecutionClaimFresh`.

Este resultado não substitui nem apaga o FAIL histórico de M07-S1. Não autoriza S2, S3, S4, M05 ou produção. Uma correção requer novo gate explícito.

## Candidato e escopo

- Gate aprovado: SHA-256 `75a9967b1ad7dfc426fccd1a5cabb2a9e29f2a937188e33605e2ddb03c4b3fc1`.
- Runtime da rodada: shell persistente novo com Node `v22.23.2` no `PATH` local desse shell. O default do NVM não foi alterado.
- Fingerprint congelado: `1038f996b0577e56ecd795f1f08b6e13bb3a752d454c80f3fc0601f51c045b5f`.
- Preflight: baseline `40b33ca1f63a2c263abcd621cb25d6c6fdf6aae0d0ab05be36b108717357675a`; manifesto candidato prévio `6d2cc502d531115769884a3a693866d8d7d569c728b9f2cee68f44a76cdce305`; 973 entradas de baseline, sem divergências. As quatro adições autorizadas foram as duas mudanças de implementação/configuração, o teste do audit e `packages/conversation/src/__tests__/postgres-store.unit.test.ts`.
- A evidência de versão do npm está em `npm-version.txt` e foi vinculada por hash ao candidato.
- As variáveis de conexão PostgreSQL foram removidas dos comandos de teste. Não houve instalação, uso de rede ou conexão a banco/serviço externo.

## Execução

| Etapa | Resultado | Evidência observada |
|---|---:|---|
| Preflight Node/TypeScript e manifesto | PASS (0) | Node `v22.23.2`, TypeScript `6.0.3`; baseline íntegro e quatro adições exatas. |
| Freeze `--candidate-only` | PASS (0) | Fingerprint acima. |
| Verificação inicial do candidato | PASS (0) | Mesmo fingerprint. |
| Inventário | VIOLATION (1) | `inventoryComplete: true`; 11 violações visíveis (9 `DEPENDENCY_CATEGORY_MISMATCH`, 2 `MISSING_DIRECT_DEPENDENCY`); `gaps: []`; unresolved edge/finding/reference/source-role = 0. Adjudicação B3: `PASS_WITH_FINDINGS`, sem conformance limpa. |
| Comparação relatório/manifesto | PASS (0) | `match: true`; fingerprint do relatório igual ao candidato. |
| Testes focados | FAIL (1) | 24 passaram; 1 falhou, no novo teste de retomada de aprovação. |
| `npm test` | FAIL (1) | 302 arquivos passaram, 20 ignorados, 1 arquivo falhou; 2.136 testes passaram, 146 ignorados, 1 falhou; duração informada pelo Vitest: 298,57 s. |
| `npm run typecheck` | PASS (0) | Sem erros. |
| `npm run lint` | PASS (0) | Sem erros. |
| `npm run test:coverage` | FAIL (1) | 302 arquivos passaram, 20 ignorados, 1 arquivo falhou; 2.136 testes passaram, 146 ignorados, 1 falhou; duração informada pelo Vitest: 323,14 s. O comando não produziu um resultado aprovável de cobertura por ter falhado. |
| Pós-check do candidato | PASS (0) | Fingerprint permaneceu `1038f996b0577e56ecd795f1f08b6e13bb3a752d454c80f3fc0601f51c045b5f`. |

Os códigos de saída foram capturados imediatamente após cada comando. O teste focado e as duas execuções completas reportaram a mesma falha. O inventário com exit 1 representa achados de domínio completos de B3 e não foi confundido com aprovação limpa.

## Adjudicação dos critérios

- B1/B2/B4: o preflight e o candidato registram os 973 inputs base, os quatro paths aprovados, Node/TypeScript/npm vinculados e fingerprint reproduzível do `fingerprint_basis` salvo; freeze e verificador retornaram 0.
- B3: `PASS_WITH_FINDINGS`; o relatório está completo, expõe 11 findings e zero gaps/unresolved. As nove categorias test-only e dois vínculos ausentes continuam visíveis para slices posteriores autorizados.
- B5: o inventário e os testes autorizados usaram processamento local; as variáveis PostgreSQL foram removidas nos comandos de teste. Nenhum serviço, DB ou rede externa foi acionado.
- B6: `FAIL`; os testes focados, suite e coverage não passaram devido ao mesmo teste sintético. Como a execução de coverage terminou com exit 1, não há percentuais aprováveis para comparar com 90/85/90/90.
- B7: `PASS` para consistência e drift; relatório/manifesto coincidiram e a verificação pós-check retornou 0 com fingerprint inalterado.
- B8: `UNAVAILABLE`; a solicitação fresh-context desta rodada também foi recusada por `agent thread limit reached`, conforme [tentativa I1-02](i1-attempt-02.md).
- B9: limites do gate respeitados; o FAIL histórico M07-S1 permanece intacto, G21-5/G21-6 fechados e produção `NO_GO`.

## Revisão

Revisão independente I1: **UNAVAILABLE** nesta rodada. Nenhuma revisão lead-only foi promovida a independente. O candidato permanece verificável e sem drift, mas o gate falha pelos resultados de teste acima.

## Próximo passo permitido

Aprovar ou corrigir o [gate M07-S1-R1-C1](correction-gate-proposal.md), SHA-256 `9d865f7db78b479dacaf69ca2de7dffcc03892eff061dd49ca90ec2035eb83f1`, que vincula o [preview do fixture](correction-preview.md), SHA-256 `9d7fc894b728967aaa4f0949bc5dc8ae466d31ecc616fe9a902a58859ebb0c17`. Até essa decisão, o fixture não será editado nem os checks repetidos. Manter runtime de produção em `NO_GO`.
