# REM21-013 — Discovery

## Escopo e autorização

Esta task trata o achado `A21-F15` (`AUD20-002`) em escopo local, sintético e
descartável sob `G21-1`. Nenhum provider, canal, IdP, banco externo, segredo,
usuário ou dado real será usado; produção permanece `NO_GO`.

## Baseline observado

O `scripts/mutation-guard.mjs` existente selecionava três mutantes somente em
`scripts/lib/coverage-gate.mjs`, executava drivers inline e emitia um relatório
sem manifesto versionado, hash da origem, domínio de risco, budget explícito,
testes focados por módulo ou binding de run/candidate. Assim, um guard podia
passar sem provar identity, policy, SSRF, replay, approval, rate limiter e
persistence.

O baseline também não possuía teste negativo para alteração do conjunto de
mutantes. A barra já declarava `mutation:guard` como gate bloqueante, portanto
a expansão precisa conservar o fail-closed: selector ambíguo, source drift,
manifest inválido, timeout ou mutante sobrevivente não podem produzir `PASS`.

## Superfícies selecionadas

O conjunto mínimo crítico foi escolhido por invariantes já caracterizadas no
repositório:

| Domínio | Origem | Invariante | Prova focada |
| --- | --- | --- | --- |
| identity | `apps/api/src/operator-identity.ts` | expiração no limite | trusted identity |
| replay | `apps/api/src/operator-identity.ts` | `jti` repetido falha | trusted identity |
| policy | `packages/policy-engine/src/engine.ts` | `DENY` vence | policy branch hardening |
| SSRF | `packages/shared/src/ssrf.ts` | private network não é liberada por acidente | SSRF egress |
| approval | `packages/approval-engine/src/engine.ts` | self-approval falha | approval engine |
| rate-limiter | `apps/api/src/rate-limit.ts` | limite máximo é inclusivo | rate limit |
| persistence | `packages/persistence/src/outbox-content-hash.ts` | conteúdo divergente conflita | outbox binding |

Os três mutantes de cobertura existentes permanecem no manifest para não
reduzir o conjunto já verificado.

## Evidência de entrada

- `npm run mutation:guard` no baseline demonstrava apenas `3/3` mutantes de
  cobertura;
- os selectors acima são únicos nas fontes atuais e os testes focados existem;
- o RED desta task é `tests/mutation-guard.test.js`, que importa o contrato de
  governança ainda inexistente e exige os sete domínios, budget, hash e
  rejeição de alteração.

## Decisão de discovery

Avançar para PRD/SPEC com manifest declarativo, validação estrita, execução
isolada em cópia temporária e relatório candidate-bound. A alteração de fonte
de teste ou produção para “matar” um mutante não será aceita sem que o teste
expresse uma invariável de segurança existente.
