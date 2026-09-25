# REM21-005 — BUILD / AUDIT local

- task: `REM21-005`
- finding: `A21-F04`
- audited_at: `2026-09-21T19:03:53-03:00`
- runtime: `Node v22.23.2`
- scope: local, synthetic, disposable
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`
- production: `NO_GO`

## Resultado

O console trusted/default agora começa bloqueado, consome um bootstrap assinado
one-shot por uma ponte explícita e usa sessão opaca server-side. A sessão
trusted exige `OperatorSessionStore`; ausência do store fecha o bootstrap e as
rotas protegidas com `configuration_error`/`503`. Cookies desconhecidos ou
duplicados não pulam o replay fence, reautenticação gira a sessão ativa, e
logout revoga/limpa de forma idempotente.

O build web de produção não contém os controles/headers de simulação. O perfil
simulation continua disponível somente para fixtures explicitamente
controladas; a configuração Playwright existente declara esse perfil.

## Matriz de aceitação

| Critério                                           | Resultado  | Evidência                                                                                                                                                      |
| -------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 trusted/default sem campos editáveis         | PASS       | build scan sem `ID do operador`, `Papel operacional`, `Tenant ID`, `x-operator-*` ou `simulationAuthHeaders`; smoke Chromium do build: 0 inputs e lock trusted |
| AC-02 bootstrap ausente/inválido/tampered/expirado | PASS       | `operator-session.test.ts`; estado web `authentication_required`                                                                                               |
| AC-03 bootstrap válido cria sessão/cookie          | PASS       | `operator-session.test.ts` — identidade server-resolved, cookie opaco, `no-store`                                                                              |
| AC-04 replay e cookie stale                        | PASS       | replay one-use, token replay store com cookie desconhecido, cookie continua autorizando até expiração                                                          |
| AC-05 logout/repetição                             | PASS       | logout revoga, limpa e repetição retorna sucesso                                                                                                               |
| AC-06 401/expiração/reauth                         | PASS       | componente trusted, StrictMode, expiração inválida, foco restaurado                                                                                            |
| AC-07 role/tenant forjados                         | PASS       | headers forjados não elevam nem cruzam tenant                                                                                                                  |
| AC-08 simulation explícita                         | PASS       | `VITE_CVG_WEB_IDENTITY_MODE=simulation` + `VITE_CVG_CONTROLLED_TEST=true` somente no webServer E2E; produção rejeita simulation                                |
| AC-09 segredo fora de storage/URL/DOM              | PASS_LOCAL | token não é renderizado; bridge estático é consumido uma vez; bundle trusted não contém controles de simulação                                                 |
| AC-10 regressão sob Node 22                        | PASS       | 291 arquivos PASS, 2064 testes PASS, 20/144 skips; typecheck, ESLint, Prettier do slice, build, E2E e links                                                    |

## Verificações executadas

```text
PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH npm test -- --reporter=dot
  Test Files 291 passed | 20 skipped (311)
  Tests      2064 passed | 144 skipped (2208)

npm run test:e2e -- --reporter=line
  12 passed (Chromium; existing controlled simulation journeys)

npm run build:web
  167 modules; trusted bundle 369.01 kB / 106.56 kB gzip

npm run docs:check-links
  broken: []

git diff --check
  PASS

trusted build smoke via Playwright preview
  {"operatorInputs":0,"roleInputs":0,"tenantInputs":0,
   "simulationText":false,"trustedLock":true}
```

O E2E de 12 casos é mantido como regressão de fixtures simulation explícitas;
ele não é apresentado como prova de IdP, store durável ou login trusted em
produção. O smoke trusted do bundle e os testes de API/componente cobrem o
contrato local sintético.

## Crítica adversarial e correções

O primeiro ciclo de críticos fresh-context encontrou: bypass de replay por
cookie apenas sintático, rotas protegidas aceitando token sem store, ausência
de rotação em reautenticação, bootstrap duplicado sob `React.StrictMode`,
renderização frágil para `expiresAt` inválido, foco não restaurado e bridge
estático reutilizável. O ciclo BUILD seguinte corrigiu esses pontos e adicionou
testes negativos para cookie stale/duplicado, store ausente, rotação,
StrictMode, expiração inválida e foco.

## Limitações e handoff

Este resultado não fecha produção nem G21-5/G21-6. Permanecem fora do escopo:

- IdP/SSO/MFA/BFF real e custódia de chaves;
- store durável multi-instância, revogação distribuída qualificada e timeout
  operacional da porta de store;
- política final de `Secure`/`__Host-`, CSRF/CSP, domínio e topologia de cookie;
- matriz Firefox/WebKit, PostgreSQL de produção, freeze candidate-bound,
  revisão I1 e signoff de release.

Nenhum dado real, credencial, canal, consulta, prontuário, ação clínica ou
efeito externo foi usado. Não há promoção, deploy, commit ou certificação final
nesta rodada.

## Hashes dos artefatos auditados

```text
22d27252b15a3c8b47d1780320da732c56b06d20bef725b28930ef9898f223b1  apps/api/src/operator-session.ts
db66d4307c01a801d69d5100669a315ffc45a67a856cc52a600dd144f67379e6  apps/api/src/server.ts
7b62bf4f3d8d4e4b071cbd4d73599c53363350fb3db26e2b30e2bcc1651782e1  apps/api/src/__tests__/operator-session.test.ts
fc07d150f3848cdb475201950dadac898315623e4585bbe9d0850f385f70bc45  apps/web/src/App.tsx
a341ff835deca378bf746dfc2d28f55b63512651b820beba5bce04af3f0cfa0c  apps/web/src/auth/session.ts
c6c9d97a15b338c1115d76aa2f654ed4aeddfab8d7d9872054b48411cae0538b  apps/web/src/__tests__/trusted-session-app.test.tsx
e9620fb8c28e54abaa28ccb41f1247c7cebb00bc2475a0c1a4c961d977871c44  apps/web/dist/assets/index-Dr0PUgrU.js
d7ae41b67c854cd01cea732c14c3a8c6b2e7235e84b7088326a49baeeb00915f  apps/web/dist/index.html
```
