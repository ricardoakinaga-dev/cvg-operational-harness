# REM21-014 — BUILD / AUDIT

## BUILD

O BUILD criou uma configuração E2E separada para o achado `A21-F16`. O perfil
qualificado inicia API e web em `trusted`, com key ring assinado sintético e
session store em memória; a suíte não usa campos editáveis nem headers
autoafirmados para obter autoridade. A matriz congela Chromium, Firefox e
WebKit.

As cinco specs por browser cobrem bootstrap/login, ausência de controles de
identidade editáveis, axe WCAG 2A/2AA, teclado/skip link/foco visível,
contraste, reduced motion, overflow, expiração, reautenticação, logout,
recovery, role authorization e rotação de tenant. Impactos axe moderate,
serious e critical são bloqueantes; minor é registrado.

O runner `rem21-014-browser-proof.mjs` normaliza o report Playwright, exige
Node 22, trusted mode, `production=false`, `realData=false`, os três browsers,
zero skips/flaky/falhas e binding exato de run/candidate. O gate `browser-proof`
foi ligado à barra e ao workflow, que instala os três browsers.

## AUDIT FRESCO

- run: `run-rem21-014-final-2`;
- candidate: `f4f88e037214fe0cc54e446c9094a1bf7603da1f1b255cb5328427e3a73dfcf9`;
- runtime: Node `22.23.2`;
- gate: `browser-proof`, PASS em duas execuções no mesmo run/candidate;
- resultado: Chromium `5/5`, Firefox `5/5`, WebKit `5/5`; total `15/15`,
  zero skips/flaky/falhas;
- axe: seis análises, blocking `0`, minor `0`;
- trusted boundary: zero headers de autoridade de simulação nos requests
  protegidos; sessão é cookie emitido pelo API;
- negative binding: run, candidate, simulation e production scope rejeitados;
- report hash: `75927a33e064275f9b93b46e0eecad5343419305bfc81d093f532f73af7a991e`.

Os relatórios e logs preservados estão neste diretório. Os checksums são
verificados por `sha256sum -c sha256sums.txt`.

## DECISÃO

`REM21-014 = VERIFIED_LOCAL / FINAL_CERT_DEFERRED`. O proof fecha a lacuna
local de matriz browser, a11y moderada e sessão trusted, mas não prova IdP real,
browser físico, produção, I1, freeze, signoff ou a barra integral. Produção
permanece `NO_GO`; nenhuma ação clínica, financeira, de prontuário ou consulta
real foi executada.
