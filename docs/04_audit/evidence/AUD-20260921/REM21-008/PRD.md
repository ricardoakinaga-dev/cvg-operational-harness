# REM21-008 — PRD — barra CI candidate-bound em Node 22

## Problema

O repositório tem scripts de qualidade e um workflow funcional, porém não
existe uma superfície única e auditável que prove que a barra integral foi
executada no mesmo runtime e no mesmo run. Um job verde pode omitir gates
operacionais relevantes sem o contrato detectar a omissão.

## Resultado desejado

Um pull request ou push elegível deve executar uma barra explícita em Node
`22.23.2`, falhar fechado quando um gate obrigatório estiver ausente ou
falhar, e publicar artefatos imutáveis por run. A evidência local deve ser
inspecionável offline e não deve alegar certificação final, I1, G21-5 ou
produção.

## Requisitos de produto

- `PR-01`: declarar Node `22.23.2` em `.nvmrc`, manter `engines` `<23` e
  configurar Actions com `node-version-file`;
- `PR-02`: enumerar no contrato os gates `format`, `typecheck`, `lint`,
  `build`, `unit`, `coverage`, `coverage-critical`, `mutation`, `skip`,
  `postgres`, `chaos`, `evals`, `load`, `restore`, `docs`, `e2e`, `image`,
  `sbom`, `licenses`, `security`, `certify`, `certification-verify` e
  `diff`;
- `PR-03`: cada gate obrigatório aparece como step bloqueante ou como
  subcomando de um runner auditável que retorna exit code não-zero;
- `PR-04`: configurar PostgreSQL descartável, browsers e Docker somente para
  fixtures/smokes locais; não usar secrets ou serviços externos;
- `PR-05`: gravar logs e relatórios em diretório por `CI_RUN_ID` e anexá-los
  com `if-no-files-found: error`; o cache de npm é somente aceleração;
- `PR-06`: o self-test negativo deve rejeitar a remoção de um gate, a troca
  para Node fora da linha 22, a ausência de artefato por run e o uso de
  agregador que não enumera a barra;
- `PR-07`: não alterar o veredito produtivo; `G21-5`, `G21-6`, I1 e freeze
  continuam fora da autoridade local.

## Critérios de aceite

| ID    | Critério verificável                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | `.nvmrc`, `package.json`, workflow e Dockerfile declaram Node 22; o runner local rejeita Node 20/24.                             |
| AC-02 | O contrato de CI enumera todos os gates da barra e o workflow os invoca explicitamente, sem depender apenas de `npm run verify`. |
| AC-03 | O self-test negativo passa ao rejeitar workflow sinteticamente mutilado em cada dimensão crítica.                                |
| AC-04 | O workflow tem PostgreSQL, browser e imagem como gates bloqueantes e publica artefatos por run com ausência fatal.               |
| AC-05 | Logs/manifesto carregam run e candidate; diretórios de cache não entram no candidate.                                            |
| AC-06 | Validação local equivalente passa em Node `v22.23.2`; typecheck, lint, formato, links e diff passam.                             |
| AC-07 | Produção continua `NO_GO`; nenhuma certificação final ou aprovação externa é inferida.                                           |

## Fora de escopo

Ampliação da política de skips, mutation testing por risco, hardening final da
imagem, matriz Firefox/WebKit, execução em ambiente externo, secrets,
deploy, release, freeze, I1 ou qualquer efeito clínico, financeiro,
prontuário, agenda ou canal real.

## Gate

`PRD_COMPLETE / SPEC_APPROVED_CONTROLLED_BUILD`.
