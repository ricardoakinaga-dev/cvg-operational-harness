# REM21-014 — SPEC aprovada para BUILD local

## Contrato

- contrato: `rem21-014-v1`;
- task: `REM21-014` / `A21-F16`;
- estado: `SPEC_APPROVED_CONTROLLED_BUILD`;
- runtime: Node `22.23.2`;
- escopo: local, sintético, descartável; produção `NO_GO`.

## Componentes congelados

- `playwright.rem21-014.config.ts`: web server trusted, key ring sintético,
  report JSON e projetos Chromium/Firefox/WebKit;
- `tests/e2e/rem21-014-qualification.spec.ts`: journeys de bootstrap,
  expiração/recovery, logout, authorization, tenant isolation, axe, teclado,
  foco, contraste, reduced motion e overflow;
- `scripts/rem21-014-browser-proof.mjs`: runner bound ao CI e normalizador do
  report bruto Playwright;
- `scripts/rem21-014-browser-proof-contract.mjs`: contrato fail-closed para
  binding, matriz, ausência de skips, trusted mode e claims local/sintético;
- `tests/rem21-014-browser-proof.test.js`: RED/negative tests do contrato;
- `package.json`, `package-lock.json`, `.github/workflows/verify.yml` e
  `scripts/ci-bar-contract.mjs`: script e gate browser proof;
- `scripts/ci-bar.mjs`, `scripts/lib/certification-rules.mjs` e
  `.prettierignore`: binding/exclusão do artifact sem contaminar o candidate;
- `docs/runbooks/homolog-browser-accessibility.md`: matriz, interpretação de
  impactos axe, recuperação e limites.

## Semântica de autoridade

O servidor E2E recebe `CVG_IDENTITY_MODE=trusted` e um key ring local fixo
somente para a rodada. A spec gera tokens assinados para identidades sintéticas
e injeta o token uma vez antes do carregamento da aplicação. O web app troca o
token por uma sessão opaca; os requests subsequentes usam `credentials:
include` e não carregam headers de autoridade. A sessão é mantida pelo store em
memória do processo E2E e desaparece ao encerrar o web server.

## Barra de acessibilidade e browser

- browsers declarados: Chromium, Firefox e WebKit;
- nenhum browser declarado pode ficar sem resultado ou virar skip;
- impacts `moderate`, `serious` e `critical` são bloqueantes;
- `minor` é registrado no report e não pode ser omitido, mesmo quando não
  bloqueia o gate;
- keyboard/focus deve alcançar skip link, console, session action e controles
  de role; focus visible é inspecionado por CSS computado;
- `prefers-reduced-motion: reduce` deve manter controles operáveis e não pode
  depender de animação para revelar estado;
- cada viewport declarado deve ter `scrollWidth <= innerWidth`.

## Prova e report

O runner deve executar a configuração inteira uma vez, com todos os browsers,
e produzir um report normalizado que contenha:

1. `runId`, `candidateId`, `contract`, Node e timestamp;
2. `production=false`, `realData=false`, `identityMode=trusted`;
3. lista exata de browsers e contagem de passed/failed/skipped/flaky;
4. nomes das specs, impactos axe registrados e resultado por projeto;
5. verdict `PASS` somente com exit code zero, três browsers executados, zero
   falhas e zero itens não executados.

O report bruto Playwright pode ser guardado dentro do artefato normalizado para
auditoria, mas não entra no candidate digest. Dois runs do mesmo candidate são
obrigatórios para a decisão local.

## Rollback e limites

O rollback local remove apenas a configuração/spec/gate e seus reports desta
task; não reverte a composição trusted de `REM21-005` nem reescreve evidência
histórica. A qualificação não prova IdP real, multi-instância, browsers fora da
matriz, dispositivo físico ou produção.
